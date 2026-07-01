import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Researcher } from './entities/researcher.entity';
import { Area } from '../areas/entities/area.entity';
import { ResearchersService } from './researchers.service';
import { ResearchersController } from './researchers.controller';

@Module({
  // Area se registra aquí también para poder inyectar su repositorio en el service.
  imports: [TypeOrmModule.forFeature([Researcher, Area])],
  controllers: [ResearchersController],
  providers: [ResearchersService],
  exports: [ResearchersService],
})
export class ResearchersModule {}