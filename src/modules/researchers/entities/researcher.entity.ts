import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { ResearcherProfile } from '../../researcher-profiles/entities/researcher-profile.entity';
import { Area } from '../../areas/entities/area.entity';

@Entity({ name: 'researchers' })
export class Researcher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  firstName: string;

  @Column({ type: 'varchar', length: 120 })
  lastName: string;

  // Área/escuela como relación con la tabla `areas`. Nullable: un investigador
  // puede no tener área asignada. onDelete SET NULL: si se borra un área, los
  // investigadores que la tenían quedan sin área (no se borran).
  @ManyToOne(() => Area, (area) => area.researchers, {
    nullable: true,
    onDelete: 'SET NULL',
    eager: true,
  })
  @JoinColumn({ name: 'area_id' })
  area: Area | null;

  @Column({ type: 'uuid', name: 'area_id', nullable: true })
  areaId: string | null;

  @OneToMany(() => ResearcherProfile, (profile) => profile.researcher, {
    cascade: true,
  })
  profiles: ResearcherProfile[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}