import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Researcher } from './entities/researcher.entity';
import { ResearchersService } from './researchers.service';
import { ResearchersController } from './researchers.controller';

/**
 * Researchers module: registers the entity with TypeORM, exposes the
 * controller and exports the service so other modules (Excel, Statistics)
 * can reuse it without re-wiring the repository.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Researcher])],
  controllers: [ResearchersController],
  providers: [ResearchersService],
  exports: [ResearchersService],
})
export class ResearchersModule {}
