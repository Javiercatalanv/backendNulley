import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { PublicationDetailsService } from './publication-details.service';

/**
 * HTTP entry-point for browsing detailed publications. Writes go
 * through `wos-fetcher` and `scopus-fetcher` — this controller is
 * read-only on purpose.
 */
@Controller('publication-details')
export class PublicationDetailsController {
  constructor(
    private readonly publicationDetailsService: PublicationDetailsService,
  ) {}

  /** GET /publication-details — every stored publication, newest year first. */
  @Get()
  findAll() {
    return this.publicationDetailsService.findAll();
  }

  /**
   * GET /publication-details/researcher/:researcherId
   * → all publications discovered for a given researcher across
   *   every platform they have a profile on.
   */
  @Get('researcher/:researcherId')
  findByResearcher(
    @Param('researcherId', ParseUUIDPipe) researcherId: string,
  ) {
    return this.publicationDetailsService.findByResearcher(researcherId);
  }
}
