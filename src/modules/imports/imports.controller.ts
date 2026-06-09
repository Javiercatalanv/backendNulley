import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ImportsService } from './imports.service';

/** HTTP entry-point for browsing past Excel imports. */
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  /** GET /imports — recent imports, newest first. */
  @Get()
  findRecent() {
    return this.importsService.findRecent();
  }

  /** GET /imports/:id — single import detail (raw rows + summary). */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const record = await this.importsService.findById(id);
    if (!record) {
      throw new NotFoundException(`Import ${id} not found`);
    }
    return record;
  }
}
