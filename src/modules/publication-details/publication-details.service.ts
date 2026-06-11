import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PublicationDetail } from './entities/publication-detail.entity';
import { PublicationAuthorship } from './entities/publication-authorship.entity';
import { SjrResolverService } from '../sjr-resolver/sjr-resolver.service';
import { UpsertPublicationDetailInput } from './dto/upsert-publication-detail.dto';

/**
 * Persistence + read service for detailed publications.
 *
 * Three responsibilities:
 *   1. Idempotent `upsert` with cross-platform deduplication and
 *      automatic authorship attribution.
 *   2. Read endpoints for the frontend (list, by researcher).
 *   3. A `resetAll` helper used during the snapshot rebuild flow.
 *
 * Everything related to "which platform discovered this" lives inside
 * the fetchers; this service only cares about the canonical paper.
 */
@Injectable()
export class PublicationDetailsService {
  private readonly logger = new Logger(PublicationDetailsService.name);

  constructor(
    @InjectRepository(PublicationDetail)
    private readonly publicationRepository: Repository<PublicationDetail>,
    @InjectRepository(PublicationAuthorship)
    private readonly authorshipRepository: Repository<PublicationAuthorship>,
    private readonly sjrResolver: SjrResolverService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Inserts or updates a paper and attaches the calling profile as an
   * author. Designed to be called many times for the same paper (once
   * per researcher whose sync surfaced it) without producing duplicates
   * or losing prior authors.
   *
   * Algorithm:
   *   1. Try to find the paper by DOI (most reliable cross-platform).
   *   2. If no DOI or no match, try by the (platform, externalId) pair.
   *   3. If still nothing, create a new paper row.
   *   4. Merge the new source into `sources` if not already present.
   *   5. Insert a `publication_authorships` row for (paper, profile)
   *      if that link doesn't exist yet.
   *
   * `citedByCount` is updated to the maximum value seen across calls,
   * since different platforms may report slightly different numbers
   * and the higher one is usually the most up-to-date.
   */
  async upsert(input: UpsertPublicationDetailInput): Promise<PublicationDetail> {
    const publication = await this.findOrCreatePublication(input);
    await this.attachAuthorship(publication.id, input.profileId, input.sourcePlatform);
    return publication;
  }

  /**
   * Steps 1-4 of the algorithm above. Returns the persisted paper row.
   * Extracted into its own method to keep `upsert` readable.
   */
  private async findOrCreatePublication(
    input: UpsertPublicationDetailInput,
  ): Promise<PublicationDetail> {
    const newSource = {
      platform: input.sourcePlatform,
      externalPublicationId: input.externalPublicationId,
    };

    // 1. Look up by DOI when available.
    let existing: PublicationDetail | null = null;
    if (input.doi) {
      existing = await this.publicationRepository.findOne({
        where: { doi: input.doi },
      });
    }

    // 2. Fallback: look up by (platform, externalId) inside the JSON
    //    `sources` array. We use a raw JSONB containment query because
    //    TypeORM's where-builder doesn't support `@>` natively.
    if (!existing) {
      existing = await this.publicationRepository
        .createQueryBuilder('pd')
        .where('pd.sources @> :src::jsonb', {
          src: JSON.stringify([newSource]),
        })
        .getOne();
    }

    // 3a. New paper — resolve quartile, build URL, persist.
    if (!existing) {
      const sjr = this.sjrResolver.resolveByIssn(input.issn);
      const created = this.publicationRepository.create({
        title: input.title,
        journal: input.journal,
        issn: input.issn,
        year: input.year,
        doi: input.doi,
        citedByCount: input.citedByCount,
        quartile: sjr?.mainQuartile ?? null,
        mainCategory: sjr?.mainCategory ?? null,
        sources: [newSource],
        url: this.buildUrl(input),
      });
      return this.publicationRepository.save(created);
    }

    // 3b. Existing paper — merge source + take max cited count.
    let needsSave = false;

    const alreadyHasSource = existing.sources.some(
      (s) =>
        s.platform === newSource.platform &&
        s.externalPublicationId === newSource.externalPublicationId,
    );
    if (!alreadyHasSource) {
      existing.sources = [...existing.sources, newSource];
      needsSave = true;
    }

    if (input.citedByCount > existing.citedByCount) {
      existing.citedByCount = input.citedByCount;
      needsSave = true;
    }

    // If we matched by source-pair but the DOI is now available, store it
    // so future cross-platform calls can dedup by DOI.
    if (input.doi && !existing.doi) {
      existing.doi = input.doi;
      needsSave = true;
    }

    // Repair URL if it wasn't built before (legacy data).
    if (!existing.url) {
      existing.url = this.buildUrl({
        ...input,
        // prefer DOI even if it came from a different source
        doi: existing.doi ?? input.doi,
      });
      needsSave = true;
    }

    if (needsSave) {
      return this.publicationRepository.save(existing);
    }
    return existing;
  }

  /**
   * Step 5 of the algorithm. Adds the authorship link unless it
   * already exists. Doing the existence check first avoids relying on
   * the DB unique constraint to error on duplicates (which would force
   * a try/catch and ugly logs).
   */
  private async attachAuthorship(
    publicationId: string,
    profileId: string,
    discoveredVia: string,
  ): Promise<void> {
    const existing = await this.authorshipRepository.findOne({
      where: {
        publication: { id: publicationId },
        profile: { id: profileId },
      },
    });
    if (existing) return;

    const authorship = this.authorshipRepository.create({
      publication: { id: publicationId } as any,
      profile: { id: profileId } as any,
      discoveredVia,
    });
    await this.authorshipRepository.save(authorship);
  }

  /**
   * Pre-computes the user-facing link with the agreed priority:
   *   1. DOI       — universal, opens the publisher's page
   *   2. Scopus    — when no DOI but we have a Scopus EID
   *   3. WoS       — when no DOI but we have a WoS UT
   *
   * Returns null when nothing is available; the frontend should hide
   * the link in that case.
   */
  private buildUrl(input: {
    doi: string | null;
    sourcePlatform: string;
    externalPublicationId: string;
  }): string | null {
    if (input.doi) {
      return `https://doi.org/${input.doi}`;
    }
    if (input.sourcePlatform === 'SCOPUS' && input.externalPublicationId) {
      return `https://www.scopus.com/record/display.uri?eid=${input.externalPublicationId}&origin=resultslist`;
    }
    if (input.sourcePlatform === 'WOS' && input.externalPublicationId) {
      return `https://www.webofscience.com/wos/woscc/full-record/${input.externalPublicationId}`;
    }
    return null;
  }

  // ──────────────────────────────────────────────────────────────────
  // Read-side methods used by the controller and the StatisticsService.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Returns every publication where the given researcher is an author,
   * even when other UCN researchers also co-authored it.
   */
  async findByResearcher(researcherId: string): Promise<PublicationDetail[]> {
    return this.publicationRepository
      .createQueryBuilder('pd')
      .innerJoin('pd.authorships', 'auth')
      .innerJoin('auth.profile', 'profile')
      .where('profile.researcher_id = :researcherId', { researcherId })
      .leftJoinAndSelect('pd.authorships', 'a2')
      .leftJoinAndSelect('a2.profile', 'p2')
      .leftJoinAndSelect('p2.researcher', 'r2')
      .leftJoinAndSelect('p2.platform', 'plat2')
      .orderBy('pd.year', 'DESC')
      .addOrderBy('pd.title', 'ASC')
      .getMany();
  }

  /**
   * Full catalog with authors loaded. Used for admin views and stats.
   */
  findAll(): Promise<PublicationDetail[]> {
    return this.publicationRepository.find({
      relations: [
        'authorships',
        'authorships.profile',
        'authorships.profile.researcher',
        'authorships.profile.platform',
      ],
      order: { year: 'DESC' },
    });
  }

  /**
   * Drops every publication and authorship. Used by the snapshot
   * rebuild flow before re-processing all api_snapshots from MongoDB.
   *
   * Implemented with TRUNCATE inside a transaction so it's atomic and
   * fast even for hundreds of thousands of rows. CASCADE removes the
   * authorship rows automatically.
   */
  async resetAll(): Promise<{ deletedPublications: number; deletedAuthorships: number }> {
    const publicationCount = await this.publicationRepository.count();
    const authorshipCount = await this.authorshipRepository.count();

    await this.dataSource.query(
      'TRUNCATE TABLE publication_authorships, publication_details RESTART IDENTITY CASCADE',
    );

    this.logger.log(
      `Reset publication_details (${publicationCount} rows) and ` +
        `publication_authorships (${authorshipCount} rows).`,
    );

    return {
      deletedPublications: publicationCount,
      deletedAuthorships: authorshipCount,
    };
  }
}
