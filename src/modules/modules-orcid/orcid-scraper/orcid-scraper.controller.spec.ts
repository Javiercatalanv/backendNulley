/// <reference types="jest" />

import { Test, TestingModule } from '@nestjs/testing';
import { OrcidScraperController } from './orcid-scraper.controller';

describe('OrcidScraperController', () => {
  let controller: OrcidScraperController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrcidScraperController],
    }).compile();

    controller = module.get<OrcidScraperController>(OrcidScraperController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
