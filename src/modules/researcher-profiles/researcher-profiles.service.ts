import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearcherProfile } from './entities/researcher-profile.entity';
import { CreateResearcherProfileDto } from './dto/create-researcher-profile.dto';

/**
 * Application logic for the (researcher × platform) link.
 *
 * Single responsibility: anything related to the external IDs (WOS code,
 * SCOPUS code) lives here. The Excel importer uses `findOrCreate` to be
 * idempotent — re-running the same import does not create duplicates.
 */
@Injectable()
export class ResearcherProfilesService {
  constructor(
    @InjectRepository(ResearcherProfile)
    private readonly profileRepository: Repository<ResearcherProfile>,
  ) {}

  /**
   * Creates a profile from a DTO carrying only IDs. Throws 409 if a
   * profile for the same (researcher, platform) pair already exists.
   */
  async create(dto: CreateResearcherProfileDto): Promise<ResearcherProfile> {
    const existing = await this.profileRepository.findOne({
      where: {
        researcher: { id: dto.researcherId },
        platform: { id: dto.platformId },
      },
    });
    if (existing) {
      throw new ConflictException(
        'This researcher already has a profile on this platform',
      );
    }
    const profile = this.profileRepository.create({
      externalId: dto.externalId,
      researcher: { id: dto.researcherId } as any,
      platform: { id: dto.platformId } as any,
    });
    return this.profileRepository.save(profile);
  }

  /**
   * Returns the profile for a (researcher, platform) pair if it exists,
   * otherwise creates and persists it. Used by the Excel importer to
   * keep the import idempotent.
   *
   * The lookup is done by IDs of the related entities so the caller is
   * free to pass already-loaded instances.
   */
  async findOrCreate(params: {
    researcherId: string;
    platformId: string;
    externalId: string;
  }): Promise<ResearcherProfile> {
    const existing = await this.profileRepository.findOne({
      where: {
        researcher: { id: params.researcherId },
        platform: { id: params.platformId },
      },
      relations: ['researcher', 'platform'],
    });
    if (existing) {
      // Update the externalId if the spreadsheet now carries a different
      // value (the platform might have re-issued the code).
      if (existing.externalId !== params.externalId) {
        existing.externalId = params.externalId;
        await this.profileRepository.save(existing);
      }
      return existing;
    }
    const created = this.profileRepository.create({
      externalId: params.externalId,
      researcher: { id: params.researcherId } as any,
      platform: { id: params.platformId } as any,
    });
    return this.profileRepository.save(created);
  }

  /** Lists every profile with full eager loading — used in admin views. */
  findAll(): Promise<ResearcherProfile[]> {
    return this.profileRepository.find({
      relations: ['researcher', 'platform', 'publications'],
    });
  }
}
