import { Module } from '@nestjs/common';
import { ExcelService } from './excel.service';
import { ResearchersModule } from '../researchers/researchers.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { ResearcherProfilesModule } from '../researcher-profiles/researcher-profiles.module';
import { PublicationsModule } from '../publications/publications.module';
import { ImportsModule } from '../imports/imports.module';

/**
 * Wires the Excel orchestrator with all the domain modules whose services
 * it needs to call. Each of those modules already exports its own service,
 * so we just import the modules — no provider duplication.
 */
@Module({
  imports: [
    ResearchersModule,
    PlatformsModule,
    ResearcherProfilesModule,
    PublicationsModule,
    ImportsModule,
  ],
  providers: [ExcelService],
  exports: [ExcelService],
})
export class ExcelModule {}
