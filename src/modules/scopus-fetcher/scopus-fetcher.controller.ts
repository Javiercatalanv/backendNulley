import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ScopusFetcherService } from './scopus-fetcher.service';
import { JwtAuthGuard } from '../auth/guards/jwt.auth.guard';

/**
 * HTTP entry-point for triggering Scopus syncs. Mirrors `wos-fetcher`
 * so the frontend can render both with the same UI components.
 */
@Controller('scopus-fetcher')
export class ScopusFetcherController {
  constructor(private readonly scopusFetcherService: ScopusFetcherService) {}

  /**
   * GET /scopus-fetcher/test/:scopusAuthorId
   * Example:
   *   curl http://localhost:3000/scopus-fetcher/test/57221263468
   */
  @Get('test/:scopusAuthorId')
  test(@Param('scopusAuthorId') scopusAuthorId: string) {
    return this.scopusFetcherService.testByExternalId(scopusAuthorId);
  }

  /**
   * POST /scopus-fetcher/sync
   * → syncs every Scopus profile registered in the database.
   * Requiere sesión de administrador: consume la API externa de Scopus y
   * escribe en la base de datos, así que no puede quedar abierto.
   */
  @Post('sync')
  @UseGuards(JwtAuthGuard)
  syncAll() {
    return this.scopusFetcherService.syncAllProfiles();
  }

  /**
   * POST /scopus-fetcher/sync/:profileId
   * → syncs a single profile by its internal UUID. Useful for ad-hoc
   */
  @Post('sync/:profileId')
  @UseGuards(JwtAuthGuard)
  syncOne(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.scopusFetcherService.syncOneProfile(profileId);
  }
}