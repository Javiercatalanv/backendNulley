import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicationDetail } from './entities/publication-detail.entity';
import { SjrResolverService } from '../sjr-resolver/sjr-resolver.service';
import { UpsertPublicationDetailInput } from './dto/upsert-publication-detail.dto';

/**
 * Persistence and read-side service for detailed publications.
 *
 * Single responsibility: turning the normalized payload produced by a
 * fetcher into a row in `publication_details`, resolving the quartile
 * along the way. Fetchers never touch the repository directly — they
 * call `upsert()` here, which keeps the resolution rule centralized.
 */
@Injectable()
export class PublicationDetailsService {
  constructor(
    @InjectRepository(PublicationDetail)
    private readonly publicationDetailRepository: Repository<PublicationDetail>,
    private readonly sjrResolver: SjrResolverService,
  ) {}

  /**
   * Inserts or updates a publication. Resolution happens here:
   *
   *  1. Look up the journal in the Scimago index by ISSN.
   *  2. Use the "main category" quartile (per product decision —
   *     not the "best" quartile across all categories).
   *  3. When the ISSN is not found, store the publication anyway with
   *     `quartile = null`. Common for new journals, book chapters and
   *     conference proceedings.
   *
   * Idempotency is guaranteed by the unique constraint on
   * (sourcePlatform, externalPublicationId): re-syncing the same
   * researcher refreshes existing rows instead of inserting duplicates.
   */
  async upsert(input: UpsertPublicationDetailInput): Promise<PublicationDetail> {
    const sjrEntry = this.sjrResolver.resolveByIssn(input.issn);

    const payload = {
      title: input.title,
      journal: input.journal,
      issn: input.issn,
      year: input.year,
      doi: input.doi,
      citedByCount: input.citedByCount,
      sourcePlatform: input.sourcePlatform,
      externalPublicationId: input.externalPublicationId,
      quartile: sjrEntry?.mainQuartile ?? null,
      mainCategory: sjrEntry?.mainCategory ?? null,
      profile: { id: input.profileId } as any,
    };

    const existing = await this.publicationDetailRepository.findOne({
      where: {
        sourcePlatform: input.sourcePlatform,
        externalPublicationId: input.externalPublicationId,
      },
    });

    if (existing) {
      Object.assign(existing, payload);
      return this.publicationDetailRepository.save(existing);
    }

    const created = this.publicationDetailRepository.create(payload);
    return this.publicationDetailRepository.save(created);
  }

  /**
   * Returns every detailed publication for a given researcher across
   * all their profiles. Used by the researcher detail page in the UI.
   */
  findByResearcher(researcherId: string): Promise<PublicationDetail[]> {
    return this.publicationDetailRepository
      .createQueryBuilder('pd')
      .innerJoin('pd.profile', 'profile')
      .where('profile.researcher_id = :researcherId', { researcherId })
      .orderBy('pd.year', 'DESC')
      .addOrderBy('pd.title', 'ASC')
      .getMany();
  }

  /** Lists every detailed publication — useful for admin views and tests. */
  findAll(): Promise<PublicationDetail[]> {
    return this.publicationDetailRepository.find({
      relations: ['profile'],
      order: { year: 'DESC' },
    });
  }
}
