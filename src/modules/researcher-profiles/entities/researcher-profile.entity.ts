import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Researcher } from '../../researchers/entities/researcher.entity';
import { Platform } from '../../platforms/entities/platform.entity';
import { Publication } from '../../publications/entities/publication.entity';

/**
 * Link table between a Researcher and a Platform, holding the external ID
 * (the code given by the platform itself, e.g. "MIK-4669-2025" for WOS or
 * "57221263468" for Scopus).
 *
 * The `(researcherId, platformId)` pair is unique: a researcher has at
 * most one profile per platform. The `externalId` is also indexed because
 * lookups during imports happen by external code, not by internal UUID.
 */
@Entity({ name: 'researcher_profiles' })
@Unique('UQ_researcher_platform', ['researcher', 'platform'])
export class ResearcherProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Identifier issued by the external platform (WOS ID, SCOPUS ID, ...). */
  @Index()
  @Column({ type: 'varchar', length: 100 })
  externalId: string;

  @ManyToOne(() => Researcher, (researcher) => researcher.profiles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'researcher_id' })
  researcher: Researcher;

  @ManyToOne(() => Platform, (platform) => platform.profiles, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  /**
   * Yearly publication counters for this profile.
   * `cascade: true` persists publications together with the profile.
   */
  @OneToMany(() => Publication, (publication) => publication.profile, {
    cascade: true,
  })
  publications: Publication[];

  @CreateDateColumn()
  createdAt: Date;
}
