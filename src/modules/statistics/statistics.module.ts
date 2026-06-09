import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { Publication } from '../publications/entities/publication.entity';
import { Researcher } from '../researchers/entities/researcher.entity';

/**
 * Statistics module reads from both Publication and Researcher tables,
 * so it registers both repositories itself instead of importing the
 * other modules — that keeps the dependency graph tree-shaped.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Publication, Researcher])],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
