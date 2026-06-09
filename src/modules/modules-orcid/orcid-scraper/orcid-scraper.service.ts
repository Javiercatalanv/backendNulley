import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

/**
 * Normalised shape of a publication returned by either lookup method.
 * Keeping a single type means the controller and the frontend can use
 * the same component to render results from both endpoints.
 */
export interface OrcidPublication {
  title: string;
  type: string;
  year: string;
  journal: string;
  url: string | null;
}

/**
 * Client for the ORCID public API (https://pub.orcid.org/v3.0).
 *
 * No API key required — ORCID exposes a public read-only tier that's
 * generous enough for our use case. Two entry points are offered:
 *
 *  - getAcademicByName: useful for ad-hoc discovery; takes a free-text
 *    name and tries to resolve the first matching ORCID iD.
 *  - getAcademicByOrcidId: deterministic lookup when the ORCID iD is
 *    already known. Preferred for any automated workflow because it
 *    avoids the ambiguity of name-based searches.
 */
@Injectable()
export class OrcidScraperService {
  private readonly logger = new Logger(OrcidScraperService.name);
  private readonly ORCID_API_URL = 'https://pub.orcid.org/v3.0';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Resolves an academic by free-text name and returns their works.
   *
   * Limitation: takes the FIRST search hit. If two researchers share a
   * name this can be wrong — that's why `getAcademicByOrcidId` exists.
   */
  async getAcademicByName(academicName: string) {
    this.logger.log(`Searching ORCID by name: ${academicName}`);

    try {
      // 1. Resolve the ORCID iD from the name.
      const searchUrl = `${this.ORCID_API_URL}/expanded-search/?q=${encodeURIComponent(academicName)}`;
      const searchResponse = await lastValueFrom(
        this.httpService.get(searchUrl, {
          headers: { Accept: 'application/json' },
        }),
      );

      const results = searchResponse.data['expanded-result'];
      if (!results || results.length === 0) {
        return {
          message: `No profile found in ORCID for: ${academicName}`,
        };
      }

      const academicProfile = results[0];
      const orcidId = academicProfile['orcid-id'];
      this.logger.log(
        `ORCID iD resolved: ${orcidId} — fetching works...`,
      );

      // 2. Fetch publications using the resolved iD.
      const publications = await this.fetchWorks(orcidId);

      return {
        academic: `${academicProfile['given-names']} ${academicProfile['family-names']}`,
        orcidId,
        institutionInfo: academicProfile['institution-name'] || [],
        totalPublications: publications.length,
        publications,
      };
    } catch (error: unknown) {
      this.handleError(`name=${academicName}`, error);
    }
  }

  /**
   * Looks up a researcher directly by their ORCID iD (e.g. "0000-0002-1825-0097").
   * Deterministic — no name ambiguity.
   *
   * Useful as the "I know who I'm looking for" entry point and for the
   * future automated semester sync.
   */
  async getAcademicByOrcidId(orcidId: string) {
    this.logger.log(`Fetching ORCID profile: ${orcidId}`);

    try {
      // 1. Read the person record to surface the name on the response.
      const personUrl = `${this.ORCID_API_URL}/${orcidId}/person`;
      const personResponse = await lastValueFrom(
        this.httpService.get(personUrl, {
          headers: { Accept: 'application/json' },
        }),
      );
      const givenName =
        personResponse.data?.name?.['given-names']?.value ?? '';
      const familyName =
        personResponse.data?.name?.['family-name']?.value ?? '';

      // 2. Fetch publications.
      const publications = await this.fetchWorks(orcidId);

      return {
        academic: `${givenName} ${familyName}`.trim() || orcidId,
        orcidId,
        totalPublications: publications.length,
        publications,
      };
    } catch (error: unknown) {
      this.handleError(`orcidId=${orcidId}`, error);
    }
  }

  /**
   * Private helper that retrieves and normalises the works list for a
   * resolved ORCID iD. Shared by both public lookup methods to avoid
   * duplicating the mapping logic.
   *
   * Each ORCID "group" represents the same work as reported by multiple
   * sources (the author's CV, the publisher, etc.). We use the first
   * summary because it's usually the canonical version submitted by
   * the researcher themself.
   */
  private async fetchWorks(orcidId: string): Promise<OrcidPublication[]> {
    const worksUrl = `${this.ORCID_API_URL}/${orcidId}/works`;
    const worksResponse = await lastValueFrom(
      this.httpService.get(worksUrl, {
        headers: { Accept: 'application/json' },
      }),
    );

    const worksGroup = worksResponse.data.group || [];

    return worksGroup.map((group: any) => {
      const summary = group['work-summary'][0];
      return {
        title: summary.title?.title?.value || 'Untitled',
        type: summary.type || 'N/A',
        year: summary['publication-date']?.year?.value || 'N/A',
        journal: summary['journal-title']?.value || 'N/A',
        url: summary.url?.value || null,
      };
    });
  }

  /**
   * Unified error handler so both public methods produce the same shape
   * of HttpException. Logs the original error with context so debugging
   * is easy.
   */
  private handleError(context: string, error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`ORCID API error (${context}): ${message}`);
    throw new HttpException(
      'Error communicating with the ORCID API',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
