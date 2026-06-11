import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { postgresConfig } from './config/postgres.config';
import { mongoConfig } from './config/mongo.config';
import { ResearchersModule } from './modules/researchers/researchers.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { ResearcherProfilesModule } from './modules/researcher-profiles/researcher-profiles.module';
import { PublicationsModule } from './modules/publications/publications.module';
import { ImportsModule } from './modules/imports/imports.module';
import { ExcelModule } from './modules/excel/excel.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { UploadModule } from './modules/upload/upload.module';
import { OrcidScraperModule } from './modules/modules-orcid/orcid-scraper/orcid-scraper.module';
import { SjrResolverModule } from './modules/sjr-resolver/sjr-resolver.module';
import { PublicationDetailsModule } from './modules/publication-details/publication-details.module';
import { WosFetcherModule } from './modules/wos-fetcher/wos-fetcher.module';
import { ScopusFetcherModule } from './modules/scopus-fetcher/scopus-fetcher.module';
import { ApiSnapshotsModule } from './modules/api-snapshots/api-snapshots.module';

/**
 * Root module of the application.
 *
 * Composition order:
 *   1. ConfigModule first (every other module reads env vars).
 *   2. PostgreSQL & MongoDB asynchronously, so the ConfigService is
 *      available when their option factories run.
 *   3. Feature modules — each one is self-contained and only imports
 *      the modules whose services it actually uses.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // PostgreSQL — relational storage.
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: postgresConfig,
    }),

    // MongoDB — schemaless audit + raw API payloads.
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: mongoConfig,
    }),

    // Core feature modules.
    ResearchersModule,
    PlatformsModule,
    ResearcherProfilesModule,
    PublicationsModule,
    ImportsModule,
    ExcelModule,
    StatisticsModule,
    UploadModule,

    // External-data integration modules.
    OrcidScraperModule,        // ORCID public API client (kept as-is).
    SjrResolverModule,         // In-memory Scimago index for quartile lookup.
    PublicationDetailsModule,  // Stores enriched publications (title, journal, quartile, year).
    ApiSnapshotsModule,        // Stores raw API responses (audit + replay without re-fetch).
    WosFetcherModule,          // Web of Science Starter API client.
    ScopusFetcherModule,       // Scopus Search API client.
  ],
})
export class AppModule {}
