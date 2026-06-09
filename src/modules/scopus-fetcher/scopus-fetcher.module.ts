import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScopusFetcherService } from './scopus-fetcher.service';
import { ScopusFetcherController } from './scopus-fetcher.controller';
import { ResearcherProfile } from '../researcher-profiles/entities/researcher-profile.entity';
import { PublicationDetailsModule } from '../publication-details/publication-details.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([ResearcherProfile]),
    PublicationDetailsModule,
  ],
  controllers: [ScopusFetcherController],
  providers: [ScopusFetcherService],
  exports: [ScopusFetcherService],
})
export class ScopusFetcherModule {}
