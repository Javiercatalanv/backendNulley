import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ResearcherProfile } from '../../researcher-profiles/entities/researcher-profile.entity';

/**
 * Represents a researcher (person) tracked by the system.
 *
 * One researcher can have multiple profiles on different academic platforms
 * (Web of Science, Scopus, etc.). The associated profiles are accessed via
 * the `profiles` relation, which makes it trivial to load all the external
 * IDs and publication counts of a researcher in a single query.
 */
@Entity({ name: 'researchers' })
export class Researcher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  firstName: string;

  @Column({ type: 'varchar', length: 120 })
  lastName: string;

  /**
   * One researcher → many profiles (one per academic platform).
   * `cascade: true` lets us persist a researcher together with its profiles
   * in a single `save()` call, which is convenient when importing from Excel.
   */
  @OneToMany(() => ResearcherProfile, (profile) => profile.researcher, {
    cascade: true,
  })
  profiles: ResearcherProfile[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
