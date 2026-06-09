import { Test, TestingModule } from '@nestjs/testing';
import { OrcidScraperService } from './orcid-scraper.service';

describe('OrcidScraperService', () => {
  let service: OrcidScraperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrcidScraperService],
    }).compile();

    service = module.get<OrcidScraperService>(OrcidScraperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
