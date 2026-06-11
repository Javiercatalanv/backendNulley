import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { PublicationDetailsService } from './publication-details.service';
import { ScopusFetcherService } from '../scopus-fetcher/scopus-fetcher.service';
import { WosFetcherService } from '../wos-fetcher/wos-fetcher.service';

/**
 * HTTP entry-point for browsing publications and triggering the
 * snapshot-based rebuild.
 *
 * Reads are open; the rebuild is destructive and should be auth-gated
 * in production (TODO when we add authentication).
 */
@Controller('publication-details')
export class PublicationDetailsController {
  constructor(
    private readonly publicationDetailsService: PublicationDetailsService,
    private readonly scopusFetcherService: ScopusFetcherService,
    private readonly wosFetcherService: WosFetcherService,
  ) {}

  /** GET /publication-details — full catalog with authors. */
  @Get()
  findAll() {
    return this.publicationDetailsService.findAll();
  }

  /** GET /publication-details/researcher/:id — papers where the researcher is co-author. */
  @Get('researcher/:researcherId')
  findByResearcher(
    @Param('researcherId', ParseUUIDPipe) researcherId: string,
  ) {
    return this.publicationDetailsService.findByResearcher(researcherId);
  }

  /**
   * POST /publication-details/rebuild-from-snapshots
   *
   * Drops all publications and authorships, then re-processes every
   * successful api_snapshot from MongoDB through each fetcher's
   * snapshot reprocessor. Result: the relational tables are rebuilt
   * with the latest parsing/dedup logic, WITHOUT spending a single
   * external API request.
   *
   * Run this after schema migrations or whenever the parsing logic
   * changes (new fields extracted, quartile recomputation, etc).
   */
  @Post('rebuild-from-snapshots')
  async rebuildFromSnapshots() {
    const reset = await this.publicationDetailsService.resetAll();
    const scopus = await this.scopusFetcherService.reprocessAllSnapshots();
    const wos = await this.wosFetcherService.reprocessAllSnapshots();
    return {
      reset,
      scopus,
      wos,
      message:
        'Rebuild complete. All publications were re-processed from MongoDB snapshots; no external API calls were made.',
    };
  }
}
