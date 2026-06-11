import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WosFetcherService } from './wos-fetcher.service';
import { WosFetcherController } from './wos-fetcher.controller';
import { ResearcherProfile } from '../researcher-profiles/entities/researcher-profile.entity';
import { PublicationDetailsModule } from '../publication-details/publication-details.module';
import { ApiSnapshotsModule } from '../api-snapshots/api-snapshots.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([ResearcherProfile]),
    forwardRef(() => PublicationDetailsModule),
    ApiSnapshotsModule,
  ],
  controllers: [WosFetcherController],
  providers: [WosFetcherService],
  exports: [WosFetcherService],
})
export class WosFetcherModule {}
