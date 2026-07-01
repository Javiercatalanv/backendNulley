import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ResearchersService } from './researchers.service';
import { CreateResearcherDto } from './dto/create-researcher.dto';
import { UpdateResearcherAreaDto } from './dto/update-researcher-area.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.auth.guard';

@Controller('researchers')
export class ResearchersController {
  constructor(private readonly researchersService: ResearchersService) {}

  /** PROTEGIDO — crear investigador requiere token de admin. */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateResearcherDto) {
    return this.researchersService.create(dto);
  }

  /** PÚBLICO — la lista de académicos es visible para toda la comunidad. */
  @Get()
  findAll() {
    return this.researchersService.findAll();
  }

  /** PÚBLICO — el perfil de un académico es visible. */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.researchersService.findOne(id);
  }

  /** PROTEGIDO — cambiar la escuela/área de un investigador requiere token de admin. */
  @Patch(':id/area')
  @UseGuards(JwtAuthGuard)
  updateArea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResearcherAreaDto,
  ) {
    return this.researchersService.updateArea(id, dto);
  }
}