import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiSnapshotsService } from './api-snapshots.service';

/**
 * Read-only HTTP entry-point for inspecting captured API responses.
 *
 * No POST/PUT/DELETE: snapshots are produced by the fetchers (and only
 * by the fetchers). The frontend or an admin UI uses these endpoints to
 * answer "what did the API tell us last time we asked?" without spending
 * a request from our quota.
 */
@Controller('api-snapshots')
export class ApiSnapshotsController {
  constructor(private readonly apiSnapshotsService: ApiSnapshotsService) {}

  /**
   * GET /api-snapshots?limit=20&skip=0
   * → Paginated audit list (raw payload omitted to keep responses small).
   */
  @Get()
  list(
    @Query('limit') limit = '50',
    @Query('skip') skip = '0',
  ) {
    return this.apiSnapshotsService.list(Number(limit), Number(skip));
  }

  /**
   * GET /api-snapshots/latest/:platform/:externalId
   * → Latest successful snapshot for that (platform, externalId) pair.
   *   This is the "use the cache" endpoint: lets the frontend look at
   *   what we already know without burning an API call.
   */
  @Get('latest/:platform/:externalId')
  async findLatest(
    @Param('platform') platform: string,
    @Param('externalId') externalId: string,
  ) {
    const snapshot = await this.apiSnapshotsService.findLatest(
      platform.toUpperCase(),
      externalId,
    );
    if (!snapshot) {
      throw new NotFoundException(
        `No snapshot found for ${platform.toUpperCase()}/${externalId}`,
      );
    }
    return snapshot;
  }

  /**
   * GET /api-snapshots/:id
   * → Full snapshot by id, with the raw payload included.
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const snapshot = await this.apiSnapshotsService.findById(id);
    if (!snapshot) {
      throw new NotFoundException(`Snapshot ${id} not found`);
    }
    return snapshot;
  }
}
