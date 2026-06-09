import { Body, Controller, Get, Post } from '@nestjs/common';
import { ResearcherProfilesService } from './researcher-profiles.service';
import { CreateResearcherProfileDto } from './dto/create-researcher-profile.dto';

@Controller('researcher-profiles')
export class ResearcherProfilesController {
  constructor(
    private readonly researcherProfilesService: ResearcherProfilesService,
  ) {}

  /** POST /researcher-profiles — manually attach a platform profile to a researcher. */
  @Post()
  create(@Body() dto: CreateResearcherProfileDto) {
    return this.researcherProfilesService.create(dto);
  }

  /** GET /researcher-profiles — full listing (admin / debugging). */
  @Get()
  findAll() {
    return this.researcherProfilesService.findAll();
  }
}
