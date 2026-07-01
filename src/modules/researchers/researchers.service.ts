import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Researcher } from './entities/researcher.entity';
import { CreateResearcherDto } from './dto/create-researcher.dto';
import { UpdateResearcherAreaDto } from './dto/update-researcher-area.dto';
import { Area } from '../areas/entities/area.entity';

@Injectable()
export class ResearchersService {
  constructor(
    @InjectRepository(Researcher)
    private readonly researcherRepository: Repository<Researcher>,
    @InjectRepository(Area)
    private readonly areaRepository: Repository<Area>,
  ) {}

  async create(dto: CreateResearcherDto): Promise<Researcher> {
    const researcher = this.researcherRepository.create(dto);
    return this.researcherRepository.save(researcher);
  }

  findAll(): Promise<Researcher[]> {
    return this.researcherRepository.find({
      relations: ['profiles', 'profiles.platform', 'profiles.publications', 'area'],
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Researcher> {
    const researcher = await this.researcherRepository.findOne({
      where: { id },
      relations: ['profiles', 'profiles.platform', 'profiles.publications', 'area'],
    });
    if (!researcher) {
      throw new NotFoundException(`Researcher ${id} not found`);
    }
    return researcher;
  }

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

  /**
   * Asigna un área (por su UUID) a un investigador. Valida que ambos existan.
   * Admin-only (protegido en el controller con JwtAuthGuard).
   */
  async updateArea(id: string, dto: UpdateResearcherAreaDto): Promise<Researcher> {
    const researcher = await this.researcherRepository.findOne({ where: { id } });
    if (!researcher) {
      throw new NotFoundException(`Researcher ${id} not found`);
    }
    const area = await this.areaRepository.findOne({ where: { id: dto.areaId } });
    if (!area) {
      throw new NotFoundException(`Area ${dto.areaId} not found`);
    }
    researcher.area = area;
    researcher.areaId = area.id;
    return this.researcherRepository.save(researcher);
  }
}