import {
  Injectable,
  Logger,
  InternalServerErrorException,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearcherProfile } from '../researcher-profiles/entities/researcher-profile.entity';
import { PublicationDetailsService } from '../publication-details/publication-details.service';

/**
 * Outcome of a Scopus sync for a single profile. Mirrors `WosSyncResult`
 * on purpose so the frontend can render both with the same component.
 */
export interface ScopusSyncResult {
  profileId: string;
  externalId: string;
  fullName: string;
  fetched: number;
  stored: number;
  withQuartile: number;
  errors: string[];
}

/**
 * Client for the Scopus Search API (Elsevier).
 *
 * Why API and not scraping:
 *  - Same reasons as WoS: bot detection, unstable selectors, ToS.
 *  - Elsevier offers a free institutional API for organizations with
 *    a Scopus subscription. Apply at https://dev.elsevier.com with
 *    an `@ucn.cl` or `@alumnos.ucn.cl` address while connected to the
 *    UCN network (the IP range determines institutional access).
 *
 * Rate limits (Search API): 9 requests/second, 20k requests/week.
 * Our workload (20 researchers × 2/year × ~3 pages each) is trivial.
 */
@Injectable()
export class ScopusFetcherService {
  private readonly logger = new Logger(ScopusFetcherService.name);

  /**
   * Base URL of the Scopus Search API. Stable.
   * The Search API works in two modes: STANDARD (default, less detail)
   * and COMPLETE (more fields, paid tiers). For our needs STANDARD is
   * enough and works with the free institutional tier.
   */
  private static readonly API_BASE =
    'https://api.elsevier.com/content/search/scopus';

  /** Platform code in our internal taxonomy. Matches `Platform.code`. */
  private static readonly PLATFORM_CODE = 'SCOPUS';

  /**
   * Delay between paginated requests. Elsevier allows 9 req/s; 250 ms
   * is comfortably below that and avoids spiky patterns.
   */
  private static readonly REQUEST_DELAY_MS = 250;

  /** Max records per page Elsevier allows on the free tier. */
  private static readonly PAGE_SIZE = 25;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly publicationDetailsService: PublicationDetailsService,
    @InjectRepository(ResearcherProfile)
    private readonly profileRepository: Repository<ResearcherProfile>,
  ) {}

  /**
   * Syncs every Scopus profile. Same shape as `WosFetcherService.syncAllProfiles`
   * for symmetry — the future cron job will call this twice (one for
   * each platform).
   */
  async syncAllProfiles(): Promise<ScopusSyncResult[]> {
    this.ensureApiKey();
    const profiles = await this.profileRepository
      .createQueryBuilder('profile')
      .innerJoinAndSelect('profile.platform', 'platform')
      .innerJoinAndSelect('profile.researcher', 'researcher')
      .where('platform.code = :code', {
        code: ScopusFetcherService.PLATFORM_CODE,
      })
      .getMany();

    const results: ScopusSyncResult[] = [];
    for (const profile of profiles) {
      results.push(await this.syncOneProfile(profile.id));
      await this.delay(ScopusFetcherService.REQUEST_DELAY_MS);
    }
    return results;
  }

  /**
   * Syncs a single profile by internal UUID. Validates that the profile
   * is actually a Scopus one before hitting the API.
   */
  async syncOneProfile(profileId: string): Promise<ScopusSyncResult> {
    this.ensureApiKey();
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      relations: ['researcher', 'platform'],
    });
    if (!profile) {
      throw new NotFoundException(`Profile ${profileId} not found`);
    }
    if (profile.platform.code !== ScopusFetcherService.PLATFORM_CODE) {
      throw new NotFoundException(
        `Profile ${profileId} is not a SCOPUS profile (it belongs to ${profile.platform.code})`,
      );
    }
    return this.fetchAndStoreByExternalId(profile);
  }

  /**
   * Performs the API call, normalises every entry and forwards each
   * one to `publication-details.upsert()`. Mirrors the WoS flow.
   */
  private async fetchAndStoreByExternalId(
    profile: ResearcherProfile,
  ): Promise<ScopusSyncResult> {
    const fullName =
      `${profile.researcher.firstName} ${profile.researcher.lastName}`.trim();
    this.logger.log(
      `Syncing Scopus publications for ${fullName} (AU-ID=${profile.externalId})`,
    );

    let entries: any[];
    try {
      entries = await this.fetchAllEntries(profile.externalId);
    } catch (err) {
      this.logger.error(
        `Scopus API call failed for ${fullName}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        `Could not reach the Scopus API: ${(err as Error).message}`,
      );
    }

    const result: ScopusSyncResult = {
      profileId: profile.id,
      externalId: profile.externalId,
      fullName,
      fetched: entries.length,
      stored: 0,
      withQuartile: 0,
      errors: [],
    };

    for (const entry of entries) {
      try {
        const normalized = this.normalizeEntry(entry, profile.id);
        if (!normalized) continue;
        const saved = await this.publicationDetailsService.upsert(normalized);
        result.stored += 1;
        if (saved.quartile) result.withQuartile += 1;
      } catch (err) {
        result.errors.push(
          `Entry "${entry?.['dc:title'] ?? entry?.['eid'] ?? 'unknown'}": ${(err as Error).message}`,
        );
      }
    }
    return result;
  }

  /**
   * Paginated retrieval of every entry. Scopus uses `start` (offset)
   * + `count` (page size) for pagination, unlike WoS which uses page
   * numbers. We loop until the API returns fewer items than the page
   * size, signalling the end.
   *
   * Query syntax: `AU-ID(<scopusAuthorId>)` searches by Scopus Author
   * ID, which is the external code stored in `researcher_profiles.externalId`
   * for SCOPUS rows.
   */
  private async fetchAllEntries(externalId: string): Promise<any[]> {
    const apiKey = this.configService.get<string>('SCOPUS_API_KEY') as string;
    const all: any[] = [];
    let start = 0;

    while (true) {
      const response = await lastValueFrom(
        this.httpService.get(ScopusFetcherService.API_BASE, {
          headers: {
            'X-ELS-APIKey': apiKey,
            Accept: 'application/json',
          },
          params: {
            query: `AU-ID(${externalId})`,
            count: ScopusFetcherService.PAGE_SIZE,
            start,
            // Keep response small by asking only for the fields we use.
            field:
              'dc:title,prism:publicationName,prism:issn,prism:eIssn,prism:coverDate,prism:doi,citedby-count,eid,subtypeDescription',
          },
        }),
      );

      const entries: any[] = response.data?.['search-results']?.entry ?? [];
      // Empty result set returns a single entry with `error` field.
      if (entries.length === 1 && entries[0]?.error) break;

      all.push(...entries);
      if (entries.length < ScopusFetcherService.PAGE_SIZE) break;
      start += ScopusFetcherService.PAGE_SIZE;
      await this.delay(ScopusFetcherService.REQUEST_DELAY_MS);
    }
    return all;
  }

  /**
   * Turns a Scopus `entry` object into the shape understood by the
   * publication-details service. Returns null when required fields
   * (title, year) are missing, same as the WoS normaliser.
   *
   * `prism:coverDate` arrives as "YYYY-MM-DD"; we keep only the year
   * because that's what the chart aggregations group by.
   */
  private normalizeEntry(
    entry: any,
    profileId: string,
  ): {
    title: string;
    journal: string | null;
    issn: string | null;
    year: number;
    doi: string | null;
    citedByCount: number;
    sourcePlatform: string;
    externalPublicationId: string;
    profileId: string;
  } | null {
    const title = entry?.['dc:title']?.trim?.();
    const coverDate = entry?.['prism:coverDate'];
    const year = coverDate ? parseInt(String(coverDate).slice(0, 4), 10) : null;
    if (!title || !year) return null;

    return {
      title,
      journal: entry?.['prism:publicationName'] ?? null,
      issn: entry?.['prism:issn'] ?? entry?.['prism:eIssn'] ?? null,
      year,
      doi: entry?.['prism:doi'] ?? null,
      citedByCount: Number(entry?.['citedby-count'] ?? 0),
      sourcePlatform: ScopusFetcherService.PLATFORM_CODE,
      externalPublicationId: entry?.eid ?? '',
      profileId,
    };
  }

  /**
   * Test endpoint — calls the Scopus API with the given Author ID and
   * returns the raw publications WITHOUT writing anything to the database.
   *
   * The point of this method is to let the operator validate two things
   * during initial setup:
   *   1. The API key is valid and the institutional subscription works.
   *   2. The chosen author actually exists in Scopus.
   *
   * No `researcher_profiles` row is needed — perfect for the first
   * smoke test right after pasting the key into `.env`.
   */
  async testByExternalId(scopusAuthorId: string): Promise<{
    externalId: string;
    fetched: number;
    publications: Array<{
      title: string;
      journal: string | null;
      issn: string | null;
      year: number | null;
      doi: string | null;
      citedByCount: number;
      eid: string;
    }>;
  }> {
    this.ensureApiKey();
    let entries: any[];
    try {
      entries = await this.fetchAllEntries(scopusAuthorId);
    } catch (err) {
      this.logger.error(
        `Scopus API test call failed: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        `Could not reach the Scopus API: ${(err as Error).message}`,
      );
    }

    return {
      externalId: scopusAuthorId,
      fetched: entries.length,
      publications: entries.map((entry) => {
        const coverDate = entry?.['prism:coverDate'];
        return {
          title: entry?.['dc:title'] ?? '(no title)',
          journal: entry?.['prism:publicationName'] ?? null,
          issn: entry?.['prism:issn'] ?? entry?.['prism:eIssn'] ?? null,
          year: coverDate ? parseInt(String(coverDate).slice(0, 4), 10) : null,
          doi: entry?.['prism:doi'] ?? null,
          citedByCount: Number(entry?.['citedby-count'] ?? 0),
          eid: entry?.eid ?? '',
        };
      }),
    };
  }

  /**
   * Boot-time guard mirroring the WoS one — fail fast with a clear
   * message instead of letting requests crash with cryptic 401s.
   */
  private ensureApiKey(): void {
    const apiKey = this.configService.get<string>('SCOPUS_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'SCOPUS_API_KEY is not configured. Apply for one at https://dev.elsevier.com (from the UCN network) and add it to your .env file.',
      );
    }
  }

  /** Sleep helper — see WosFetcherService for rationale. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
