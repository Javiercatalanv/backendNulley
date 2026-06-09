import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ResearcherProfile } from '../../researcher-profiles/entities/researcher-profile.entity';

/**
 * Catalog of academic platforms (Web of Science, Scopus, ...).
 *
 * Modeling platforms as their own table makes the system extensible:
 * adding a new source (e.g. Google Scholar, ORCID) is just a new row,
 * not a schema change. The unique `code` is what the Excel parser uses
 * to look up the right platform when importing rows.
 */
@Entity({ name: 'platforms' })
export class Platform {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Short, stable, machine-readable identifier, e.g. "WOS", "SCOPUS". */
  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  /** Human-readable name, e.g. "Web of Science". */
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @OneToMany(() => ResearcherProfile, (profile) => profile.platform)
  profiles: ResearcherProfile[];
}
