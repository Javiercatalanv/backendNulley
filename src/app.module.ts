import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { postgresConfig } from './config/postgres.config';
import { mongoConfig } from './config/mongo.config';
import { AuthModule } from './modules/auth/auth.module';
import { AreasModule } from './modules/areas/areas.module';
import { HealthModule } from './modules/health/health.module';
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
import { PlatformSyncModule } from './modules/platform-sync/platform-sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting global: máximo 100 peticiones por minuto por IP.
    // Protege contra abuso del portal público y fuerza bruta en /auth/login.
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // ventana de 60 segundos
        limit: 100, // 100 peticiones por IP en esa ventana
      },
    ]),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: postgresConfig,
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: mongoConfig,
    }),

    AuthModule,
    AreasModule,
    HealthModule,
    ResearchersModule,
    PlatformsModule,
    ResearcherProfilesModule,
    PublicationsModule,
    ImportsModule,
    ExcelModule,
    StatisticsModule,
    UploadModule,
    OrcidScraperModule,
    SjrResolverModule,
    PublicationDetailsModule,
    ApiSnapshotsModule,
    WosFetcherModule,
    ScopusFetcherModule,
    PlatformSyncModule,
  ],
  providers: [
    // Aplica el rate limiting a TODOS los endpoints automáticamente.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}