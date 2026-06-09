import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ResearchersService } from './researchers.service';
import { CreateResearcherDto } from './dto/create-researcher.dto';

/**
 * HTTP entry-point for researcher resources. Each handler is intentionally
 * a thin wrapper around the service: routing, validation and serialization
 * happen here, business rules live in the service.
 */
@Controller('researchers')
export class ResearchersController {
  constructor(private readonly researchersService: ResearchersService) {}

  /** POST /researchers — creates a new researcher record. */
  @Post()
  create(@Body() dto: CreateResearcherDto) {
    return this.researchersService.create(dto);
  }

  /** GET /researchers — lists every researcher with their profiles & counts. */
  @Get()
  findAll() {
    return this.researchersService.findAll();
  }

  /** GET /researchers/:id — single researcher with the same eager relations. */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.researchersService.findOne(id);
  }
}
