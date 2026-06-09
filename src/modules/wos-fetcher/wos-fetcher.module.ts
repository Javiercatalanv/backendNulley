import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WosFetcherService } from './wos-fetcher.service';
import { WosFetcherController } from './wos-fetcher.controller';
import { ResearcherProfile } from '../researcher-profiles/entities/researcher-profile.entity';
import { PublicationDetailsModule } from '../publication-details/publication-details.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([ResearcherProfile]),
    PublicationDetailsModule,
  ],
  controllers: [WosFetcherController],
  providers: [WosFetcherService],
  exports: [WosFetcherService],
})
export class WosFetcherModule {}
