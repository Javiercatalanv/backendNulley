import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { WosFetcherService } from './wos-fetcher.service';
import { JwtAuthGuard } from '../auth/guards/jwt.auth.guard';

@Controller('wos-fetcher')
export class WosFetcherController {
  constructor(private readonly wosFetcherService: WosFetcherService) {}

  /**
   * GET /wos-fetcher/test/:researcherId
   * Example:
   *   curl http://localhost:3000/wos-fetcher/test/
   */
  @Get('test/:researcherId')
  test(@Param('researcherId') researcherId: string) {
    return this.wosFetcherService.testByExternalId(researcherId);
  }

  /**
   * POST /wos-fetcher/sync
   * → syncs every WOS profile registered in the database.
   * Requiere sesión de administrador: consume la API externa de WOS y
   * escribe en la base de datos, así que no puede quedar abierto.
   */
  @Post('sync')
  @UseGuards(JwtAuthGuard)
  syncAll() {
    return this.wosFetcherService.syncAllProfiles();
  }

  /**
   * POST /wos-fetcher/sync/:profileId
   * → syncs a single profile by its internal UUID. Useful for ad-hoc
   *   refreshes after editing a researcher.
   */
  @Post('sync/:profileId')
  @UseGuards(JwtAuthGuard)
  syncOne(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.wosFetcherService.syncOneProfile(profileId);
  }
}