import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Researcher } from './entities/researcher.entity';
import { CreateResearcherDto } from './dto/create-researcher.dto';

/**
 * Application logic for researchers. Has a single responsibility:
 * persisting and retrieving the people behind the data — nothing about
 * platforms, profiles or publication counts lives here.
 */
@Injectable()
export class ResearchersService {
  constructor(
    @InjectRepository(Researcher)
    private readonly researcherRepository: Repository<Researcher>,
  ) {}

  /**
   * Persists a new researcher. Used by the public REST endpoint and also
   * (indirectly) by the Excel import flow when a researcher does not yet
   * exist in the database.
   */
  async create(dto: CreateResearcherDto): Promise<Researcher> {
    const researcher = this.researcherRepository.create(dto);
    return this.researcherRepository.save(researcher);
  }

  /**
   * Returns every researcher together with their profiles, the platform
   * each profile belongs to, and the publication counts. This single
   * eager-loaded query is what the front-end consumes to render the
   * researchers list.
   */
  findAll(): Promise<Researcher[]> {
    return this.researcherRepository.find({
      relations: ['profiles', 'profiles.platform', 'profiles.publications'],
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  /**
   * Loads a single researcher by primary key, throwing 404 if not found
   * so the controller can rely on a non-null result.
   */
  async findOne(id: string): Promise<Researcher> {
    const researcher = await this.researcherRepository.findOne({
      where: { id },
      relations: ['profiles', 'profiles.platform', 'profiles.publications'],
    });
    if (!researcher) {
      throw new NotFoundException(`Researcher ${id} not found`);
    }
    return researcher;
  }

  /**
   * Looks up a researcher by full name. Used by the Excel importer to
   * decide whether a row corresponds to an already-existing person or a
   * new one. Case-insensitive comparison keeps imports robust against
   * typing inconsistencies in source data.
   */
  findByFullName(
    firstName: string,
    lastName: string,
  ): Promise<Researcher | null> {
    return this.researcherRepository
      .createQueryBuilder('r')
      .where('LOWER(r.firstName) = LOWER(:firstName)', { firstName })
      .andWhere('LOWER(r.lastName) = LOWER(:lastName)', { lastName })
      .getOne();
  }
}
