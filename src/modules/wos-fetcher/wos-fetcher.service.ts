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
 * Result returned per profile after a sync, in a shape that's easy to
 * surface in the UI. `withQuartile` counts how many publications got a
 * Scimago match — useful to spot if the local SJR CSV is outdated.
 */
export interface WosSyncResult {
  profileId: string;
  externalId: string;
  fullName: string;
  fetched: number;
  stored: number;
  withQuartile: number;
  errors: string[];
}

/**
 * Client for the Web of Science Starter API.
 *
 * Why API and not scraping:
 *  - WoS is behind Cloudflare Bot Management; Puppeteer is detected.
 *  - DOM classes are hashed and change on every Clarivate release.
 *  - Authentication via EZproxy is brittle.
 *  - Clarivate offers a FREE Starter API for institutions with a WoS
 *    subscription (UCN has one). Apply at https://developer.clarivate.com
 *    with an `@ucn.cl` email.
 *
 * Rate limits at the time of writing: 5 requests/second, 10k/year.
 * For 20 researchers fetched twice a year we use ~40 requests total,
 * far below any threshold.
 */
@Injectable()
export class WosFetcherService {
  private readonly logger = new Logger(WosFetcherService.name);

  /**
   * Base URL of the WoS Starter API. Stable, but kept as a constant
   * here so it's easy to swap during testing.
   */
  private static readonly API_BASE =
    'https://api.clarivate.com/apis/wos-starter/v1';

  /** Platform code in our internal taxonomy. Matches `Platform.code`. */
  private static readonly PLATFORM_CODE = 'WOS';

  /**
   * Conservative delay between requests, in milliseconds. Even though
   * the published limit is 5 req/s, a 250 ms gap keeps us comfortably
   * inside it and protects against transient throttling.
   */
  private static readonly REQUEST_DELAY_MS = 250;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly publicationDetailsService: PublicationDetailsService,
    @InjectRepository(ResearcherProfile)
    private readonly profileRepository: Repository<ResearcherProfile>,
  ) {}

  /**
   * Public entry-point used by the controller. Syncs every WOS profile
   * registered in the database, one after another with a small delay
   * between calls. Returns a summary per profile so the operator can
   * spot partial failures.
   */
  async syncAllProfiles(): Promise<WosSyncResult[]> {
    this.ensureApiKey();
    const profiles = await this.profileRepository
      .createQueryBuilder('profile')
      .innerJoinAndSelect('profile.platform', 'platform')
      .innerJoinAndSelect('profile.researcher', 'researcher')
      .where('platform.code = :code', { code: WosFetcherService.PLATFORM_CODE })
      .getMany();

    const results: WosSyncResult[] = [];
    for (const profile of profiles) {
      results.push(await this.syncOneProfile(profile.id));
      await this.delay(WosFetcherService.REQUEST_DELAY_MS);
    }
    return results;
  }

  /**
   * Syncs a single profile by its internal UUID. Looks up the profile,
   * extracts the WoS external ID (ResearcherID) and forwards to
   * `fetchAndStoreByExternalId`.
   *
   * Throws 404 when the profile doesn't exist so misuse is loud, not
   * silent.
   */
  async syncOneProfile(profileId: string): Promise<WosSyncResult> {
    this.ensureApiKey();
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      relations: ['researcher', 'platform'],
    });
    if (!profile) {
      throw new NotFoundException(`Profile ${profileId} not found`);
    }
    if (profile.platform.code !== WosFetcherService.PLATFORM_CODE) {
      throw new NotFoundException(
        `Profile ${profileId} is not a WOS profile (it belongs to ${profile.platform.code})`,
      );
    }
    return this.fetchAndStoreByExternalId(profile);
  }

  /**
   * Hits the API, normalises every returned document and forwards each
   * one to `publication-details` for upsert with quartile resolution.
   *
   * Errors during the HTTP call are wrapped in a 503 because they
   * reflect an external dependency outage, not a bug in our code.
   * Per-document errors during persistence are captured in the result's
   * `errors` array so one bad row doesn't abort the whole sync.
   */
  private async fetchAndStoreByExternalId(
    profile: ResearcherProfile,
  ): Promise<WosSyncResult> {
    const fullName =
      `${profile.researcher.firstName} ${profile.researcher.lastName}`.trim();
    this.logger.log(
      `Syncing WOS publications for ${fullName} (RID=${profile.externalId})`,
    );

    let documents: any[];
    try {
      documents = await this.fetchAllDocuments(profile.externalId);
    } catch (err) {
      this.logger.error(
        `WOS API call failed for ${fullName}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        `Could not reach the Web of Science API: ${(err as Error).message}`,
      );
    }

    const result: WosSyncResult = {
      profileId: profile.id,
      externalId: profile.externalId,
      fullName,
      fetched: documents.length,
      stored: 0,
      withQuartile: 0,
      errors: [],
    };

    for (const doc of documents) {
      try {
        const normalized = this.normalizeDocument(doc, profile.id);
        if (!normalized) continue;
        const saved = await this.publicationDetailsService.upsert(normalized);
        result.stored += 1;
        if (saved.quartile) result.withQuartile += 1;
      } catch (err) {
        result.errors.push(
          `Doc "${doc?.title ?? doc?.uid ?? 'unknown'}": ${(err as Error).message}`,
        );
      }
    }
    return result;
  }

  /**
   * Wraps the paginated WoS `/documents` endpoint. Returns the union
   * of all pages. We default `limit=50` and stop when a page comes back
   * with fewer items than the limit — that's the standard signal that
   * we've reached the end of the result set.
   *
   * Query syntax: `q=AI=<authorIdentifier>` searches by Author
   * Identifier, which is the WoS field tag that accepts ResearcherIDs.
   * The value of `researcher_profiles.externalId` for WOS rows is
   * exactly a ResearcherID (e.g. "MIK-4669-2025").
   *
   * Note: the Starter API does NOT accept the `RID=` field tag; only
   * the tags listed in the error message returned by the gateway when
   * an unknown tag is used (AI, AU, CS, DO, DOP, DT, FPY, IS, OG, PG,
   * PMID, PY, SO, SUR, TI, TS, UT, VL).
   */
  private async fetchAllDocuments(externalId: string): Promise<any[]> {
    const apiKey = this.configService.get<string>('WOS_API_KEY') as string;
    const limit = 50;
    const all: any[] = [];
    let page = 1;

    while (true) {
      const response = await lastValueFrom(
        this.httpService.get(`${WosFetcherService.API_BASE}/documents`, {
          headers: { 'X-ApiKey': apiKey, Accept: 'application/json' },
          params: {
            db: 'WOS',
            q: `AI=${externalId}`,
            limit,
            page,
          },
        }),
      );

      // The Starter API returns `{ hits: [...], metadata: { total, page, limit } }`.
      const hits: any[] = response.data?.hits ?? [];
      all.push(...hits);

      if (hits.length < limit) break; // last page reached
      page += 1;
      await this.delay(WosFetcherService.REQUEST_DELAY_MS);
    }
    return all;
  }

  /**
   * Converts a raw WoS document into the shape `PublicationDetailsService`
   * understands. Returns null for entries that can't be classified
   * (missing title or year) — those are skipped silently because they
   * are usually conference posters or in-press items without enough
   * metadata to be useful.
   */
  private normalizeDocument(
    doc: any,
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
    const title = doc?.title?.trim?.() ?? doc?.title;
    const year =
      Number(doc?.source?.publishYear) ||
      Number(doc?.source?.publicationYear) ||
      null;
    if (!title || !year) return null;

    return {
      title,
      journal: doc?.source?.sourceTitle ?? doc?.source?.title ?? null,
      issn: this.extractIssn(doc),
      year,
      doi: doc?.identifiers?.doi ?? null,
      citedByCount: Number(doc?.citations?.[0]?.count ?? 0),
      sourcePlatform: WosFetcherService.PLATFORM_CODE,
      externalPublicationId: doc?.uid ?? doc?.id ?? '',
      profileId,
    };
  }

  /**
   * The Starter API exposes ISSNs in different fields depending on the
   * document type (regular article vs. book chapter vs. conference
   * paper). We probe the most common locations and return the first
   * non-empty match.
   */
  private extractIssn(doc: any): string | null {
    return (
      doc?.identifiers?.issn ??
      doc?.identifiers?.eissn ??
      doc?.source?.issn ??
      null
    );
  }

  /**
   * Test endpoint — calls the WoS API with the given ResearcherID and
   * returns the raw documents WITHOUT writing anything to the database.
   *
   * Mirror of `ScopusFetcherService.testByExternalId`. Use this right
   * after configuring `WOS_API_KEY` to confirm that:
   *   1. Clarivate approved your subscription and the key is active.
   *   2. The ResearcherID actually exists and has publications.
   *
   * No database state is required, which makes this the fastest way
   * to validate the integration end-to-end.
   */
  async testByExternalId(researcherId: string): Promise<{
    externalId: string;
    fetched: number;
    publications: Array<{
      title: string;
      journal: string | null;
      issn: string | null;
      year: number | null;
      doi: string | null;
      citedByCount: number;
      uid: string;
    }>;
  }> {
    this.ensureApiKey();
    let documents: any[];
    try {
      documents = await this.fetchAllDocuments(researcherId);
    } catch (err) {
      this.logger.error(
        `WOS API test call failed: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        `Could not reach the Web of Science API: ${(err as Error).message}`,
      );
    }

    return {
      externalId: researcherId,
      fetched: documents.length,
      publications: documents.map((doc) => ({
        title: doc?.title?.trim?.() ?? doc?.title ?? '(no title)',
        journal: doc?.source?.sourceTitle ?? doc?.source?.title ?? null,
        issn:
          doc?.identifiers?.issn ??
          doc?.identifiers?.eissn ??
          doc?.source?.issn ??
          null,
        year:
          Number(doc?.source?.publishYear) ||
          Number(doc?.source?.publicationYear) ||
          null,
        doi: doc?.identifiers?.doi ?? null,
        citedByCount: Number(doc?.citations?.[0]?.count ?? 0),
        uid: doc?.uid ?? doc?.id ?? '',
      })),
    };
  }

  /**
   * Boot-time guard. We don't want NestJS to start without an API key,
   * because the first sync call would explode cryptically. Throwing
   * an `InternalServerErrorException` here gives the operator a clear
   * 500 with an actionable message.
   */
  private ensureApiKey(): void {
    const apiKey = this.configService.get<string>('WOS_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'WOS_API_KEY is not configured. Apply for one at https://developer.clarivate.com and add it to your .env file.',
      );
    }
  }

  /**
   * Tiny sleep helper. Awaited between pages and between profiles to
   * keep request rate well under the limit and avoid burst patterns
   * that look bot-like in rate-limiter logs.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
