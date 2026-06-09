import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Publication } from './entities/publication.entity';

/**
 * Manages the yearly publication counts.
 *
 * The Excel sheet provides one number per (profile, year) cell; this
 * service is the only place in the codebase that writes those numbers,
 * which keeps the upsert logic centralised and easy to evolve.
 */
@Injectable()
export class PublicationsService {
  constructor(
    @InjectRepository(Publication)
    private readonly publicationRepository: Repository<Publication>,
  ) {}

  /**
   * Inserts or updates a single (profile, year) counter.
   *
   * The Excel can be re-imported at any time — this method must therefore
   * overwrite the existing count rather than create duplicates. The unique
   * constraint on (profile, year) at the entity level guarantees safety.
   */
  async upsert(params: {
    profileId: string;
    year: number;
    count: number;
  }): Promise<Publication> {
    const existing = await this.publicationRepository.findOne({
      where: {
        profile: { id: params.profileId },
        year: params.year,
      },
    });
    if (existing) {
      existing.count = params.count;
      return this.publicationRepository.save(existing);
    }
    const created = this.publicationRepository.create({
      year: params.year,
      count: params.count,
      profile: { id: params.profileId } as any,
    });
    return this.publicationRepository.save(created);
  }

  /**
   * Convenience method: upsert many year/count entries for the same
   * profile in a single call. Used by the Excel importer to write all
   * the year columns of a single row.
   */
  async upsertManyForProfile(
    profileId: string,
    yearCounts: Array<{ year: number; count: number }>,
  ): Promise<void> {
    for (const yc of yearCounts) {
      await this.upsert({ profileId, year: yc.year, count: yc.count });
    }
  }
}
