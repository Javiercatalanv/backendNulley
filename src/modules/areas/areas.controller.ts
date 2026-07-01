import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { AreasService } from './areas.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.auth.guard';

@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  /** PÚBLICO — la lista de áreas se usa en filtros y selects visibles a todos. */
  @Get()
  findAll() {
    return this.areasService.findAll();
  }

  /** PROTEGIDO — crear un área requiere token de admin. */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateAreaDto) {
    return this.areasService.create(dto);
  }

  /** PROTEGIDO — eliminar un área requiere token de admin. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.areasService.remove(id);
  }
}