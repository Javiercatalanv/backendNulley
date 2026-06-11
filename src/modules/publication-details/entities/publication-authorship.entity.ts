import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PublicationDetail } from './publication-detail.entity';
import { ResearcherProfile } from '../../researcher-profiles/entities/researcher-profile.entity';

/**
 * Junction table linking a `PublicationDetail` to a `ResearcherProfile`.
 *
 * Why a dedicated entity (instead of a plain join table):
 *  - It lets us track which platform's sync discovered this authorship.
 *    Useful for understanding why a researcher is attached: e.g., a
 *    paper might be linked to Carlos via WoS even if Scopus doesn't
 *    list him as an author (which happens when Scopus' author parser
 *    fails to disambiguate).
 *  - Future-proofing: easy to add `authorPosition`, `isCorresponding`,
 *    or other per-author metadata without a schema upheaval.
 *
 * Unique constraint on `(publication, profile)`: a given researcher
 * cannot appear twice on the same paper. Upserts are therefore safe to
 * call repeatedly (idempotent) — they only insert if the link is new.
 */
@Entity({ name: 'publication_authorships' })
@Unique('UQ_publication_profile', ['publication', 'profile'])
export class PublicationAuthorship {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PublicationDetail, (pub) => pub.authorships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'publication_id' })
  publication: PublicationDetail;

  @ManyToOne(() => ResearcherProfile, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'profile_id' })
  profile: ResearcherProfile;

  /**
   * Which platform's sync produced this authorship link.
   * Useful for debugging when the data on different platforms disagrees.
   */
  @Column({ type: 'varchar', length: 50 })
  discoveredVia: string;

  @CreateDateColumn()
  createdAt: Date;
}
