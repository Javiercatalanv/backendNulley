import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScopusFetcherService } from './scopus-fetcher.service';
import { ScopusFetcherController } from './scopus-fetcher.controller';
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
  controllers: [ScopusFetcherController],
  providers: [ScopusFetcherService],
  exports: [ScopusFetcherService],
})
export class ScopusFetcherModule {}
