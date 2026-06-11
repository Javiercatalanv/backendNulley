import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { PublicationDetail } from '../publication-details/entities/publication-detail.entity';
import { Researcher } from '../researchers/entities/researcher.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PublicationDetail, Researcher])],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
