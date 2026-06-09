import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { OrcidScraperService } from './orcid-scraper.service';

/**
 * HTTP entry-point for the ORCID public API client.
 *
 * Two endpoints are exposed:
 *  - `/scraper/orcid/academic?name=...` for ad-hoc discovery by name.
 *  - `/scraper/orcid/by-id/:orcidId` for deterministic lookup by iD.
 *
 * The controller does no business logic — just routing and validation.
 */
@Controller('scraper')
export class OrcidScraperController {
  constructor(private readonly orcidScraperService: OrcidScraperService) {}

  /**
   * GET /scraper/orcid/academic?name=...
   *
   * Looks up a researcher by free-text name. Returns the first matching
   * profile's publications. Useful for exploration but ambiguous when
   * multiple people share the same name.
   */
  @Get('orcid/academic')
  async getAcademicPublications(@Query('name') name: string) {
    if (!name) {
      throw new BadRequestException(
        'You must provide ?name= as a query parameter',
      );
    }
    return this.orcidScraperService.getAcademicByName(name);
  }

  /**
   * GET /scraper/orcid/by-id/:orcidId
   *
   * Deterministic lookup using an ORCID iD like "0000-0002-1825-0097".
   * Recommended for any automated workflow.
   */
  @Get('orcid/by-id/:orcidId')
  async getByOrcidId(@Param('orcidId') orcidId: string) {
    // Sanity check on the iD shape: 4 blocks of 4 chars separated by dashes,
    // last char can be an X (check digit).
    if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcidId)) {
      throw new BadRequestException(
        `Invalid ORCID iD format: "${orcidId}" — expected e.g. "0000-0002-1825-0097"`,
      );
    }
    return this.orcidScraperService.getAcademicByOrcidId(orcidId);
  }
}
