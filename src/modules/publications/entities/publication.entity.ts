import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ResearcherProfile } from '../../researcher-profiles/entities/researcher-profile.entity';

/**
 * Aggregated publication count for a (profile, year) pair.
 *
 * Storing per-year counts directly (instead of one row per published article)
 * is intentional: the source data only provides totals per year, and the
 * primary use case is plotting "publications per year" charts. Keeping the
 * table flat keeps aggregations cheap.
 *
 * The unique constraint on `(profile, year)` guarantees idempotent imports:
 * re-importing the same Excel won't create duplicate rows.
 */
@Entity({ name: 'publications' })
@Unique('UQ_profile_year', ['profile', 'year'])
export class Publication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int', default: 0 })
  count: number;

  @ManyToOne(() => ResearcherProfile, (profile) => profile.publications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profile_id' })
  profile: ResearcherProfile;
}
