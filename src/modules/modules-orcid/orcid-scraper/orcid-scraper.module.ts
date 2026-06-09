import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OrcidScraperService } from './orcid-scraper.service';
import { OrcidScraperController } from './orcid-scraper.controller';

@Module({
  imports: [HttpModule], // Necesario para hacer las peticiones a la API
  controllers: [OrcidScraperController],
  providers: [OrcidScraperService],
  exports: [OrcidScraperService],
})
export class OrcidScraperModule {}