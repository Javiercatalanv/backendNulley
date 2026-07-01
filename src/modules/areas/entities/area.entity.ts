import {
  Column, CreateDateColumn, Entity, OneToMany,
  PrimaryGeneratedColumn, UpdateDateColumn, Unique,
} from 'typeorm';
import { Researcher } from '../../researchers/entities/researcher.entity';

// Área/escuela como tabla propia (reemplaza el enum fijo anterior).
// Permite crear y eliminar áreas desde el panel de administración.
@Entity({ name: 'areas' })
@Unique(['name'])
export class Area {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @OneToMany(() => Researcher, (researcher) => researcher.area)
  researchers: Researcher[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}