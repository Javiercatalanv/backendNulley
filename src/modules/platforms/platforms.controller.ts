import { Controller, Get } from '@nestjs/common';
import { PlatformsService } from './platforms.service';

/** HTTP entry-point for the platforms catalog (read-only for now). */
@Controller('platforms')
export class PlatformsController {
  constructor(private readonly platformsService: PlatformsService) {}

  /** GET /platforms — list every registered platform. */
  @Get()
  findAll() {
    return this.platformsService.findAll();
  }
}
