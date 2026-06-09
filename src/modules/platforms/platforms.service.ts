import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Platform } from './entities/platform.entity';

/**
 * Manages the catalog of academic platforms (WOS, SCOPUS, ...).
 *
 * Implements `OnModuleInit` to seed the two platforms required by the
 * current Excel format on application startup. This makes the system
 * immediately usable in a fresh database without manual SQL.
 */
@Injectable()
export class PlatformsService implements OnModuleInit {
  /** Default platforms required by the current Excel sheet. */
  private static readonly DEFAULT_PLATFORMS: Array<{ code: string; name: string }> = [
    { code: 'WOS', name: 'Web of Science' },
    { code: 'SCOPUS', name: 'Scopus' },
  ];

  constructor(
    @InjectRepository(Platform)
    private readonly platformRepository: Repository<Platform>,
  ) {}

  /**
   * NestJS lifecycle hook: runs once when the module finishes initializing.
   * Inserts the default platforms only if they don't already exist, so
   * restarting the app is always safe (idempotent).
   */
  async onModuleInit(): Promise<void> {
    for (const platform of PlatformsService.DEFAULT_PLATFORMS) {
      const exists = await this.platformRepository.findOne({
        where: { code: platform.code },
      });
      if (!exists) {
        await this.platformRepository.save(
          this.platformRepository.create(platform),
        );
      }
    }
  }

  /** Returns every registered platform — used to populate UI selectors. */
  findAll(): Promise<Platform[]> {
    return this.platformRepository.find({ order: { name: 'ASC' } });
  }

  /**
   * Looks up a platform by its short code. Used by the Excel importer to
   * map the WOS/SCOPUS columns to actual platform rows.
   * Throws 404 instead of returning null so the importer can fail fast.
   */
  async findByCode(code: string): Promise<Platform> {
    const platform = await this.platformRepository.findOne({ where: { code } });
    if (!platform) {
      throw new NotFoundException(`Platform with code ${code} not found`);
    }
    return platform;
  }
}
