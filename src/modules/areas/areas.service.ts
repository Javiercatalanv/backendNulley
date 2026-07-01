import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Area } from './entities/area.entity';
import { CreateAreaDto } from './dto/create-area.dto';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area)
    private readonly areaRepository: Repository<Area>,
  ) {}

  findAll(): Promise<Area[]> {
    return this.areaRepository.find({ order: { name: 'ASC' } });
  }

  async create(dto: CreateAreaDto): Promise<Area> {
    const name = dto.name.trim();
    const existing = await this.areaRepository.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`An area named "${name}" already exists.`);
    }
    const area = this.areaRepository.create({ name });
    return this.areaRepository.save(area);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const area = await this.areaRepository.findOne({ where: { id } });
    if (!area) {
      throw new NotFoundException(`Area ${id} not found`);
    }
    // onDelete: SET NULL en la relación deja a los investigadores sin área
    // (no los elimina). Borrar el área es seguro.
    await this.areaRepository.remove(area);
    return { deleted: true };
  }
}