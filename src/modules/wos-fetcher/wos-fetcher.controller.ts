import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { WosFetcherService } from './wos-fetcher.service';

/**
 * HTTP entry-point for triggering WoS syncs. Mirrors `scopus-fetcher`
 * so the frontend can render both with the same UI components.
 */
@Controller('wos-fetcher')
export class WosFetcherController {
  constructor(private readonly wosFetcherService: WosFetcherService) {}

  /**
   * GET /wos-fetcher/test/:researcherId
   *
   * Smoke-test endpoint. Calls the Web of Science API with the given
   * ResearcherID and returns the raw documents WITHOUT persisting
   * anything. Use this right after pasting your API key into `.env`
   * to confirm everything is wired up correctly.
   *
   * Example:
   *   curl http://localhost:3000/wos-fetcher/test/MIK-4669-2025
   */
  @Get('test/:researcherId')
  test(@Param('researcherId') researcherId: string) {
    return this.wosFetcherService.testByExternalId(researcherId);
  }

  /**
   * POST /wos-fetcher/sync
   * → syncs every WOS profile registered in the database.
   *   This is the endpoint the future cron job will call every semester.
   */
  @Post('sync')
  syncAll() {
    return this.wosFetcherService.syncAllProfiles();
  }

  /**
   * POST /wos-fetcher/sync/:profileId
   * → syncs a single profile by its internal UUID. Useful for ad-hoc
   *   refreshes after editing a researcher.
   */
  @Post('sync/:profileId')
  syncOne(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.wosFetcherService.syncOneProfile(profileId);
  }
}
