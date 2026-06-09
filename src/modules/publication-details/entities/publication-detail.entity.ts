import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ResearcherProfile } from '../../researcher-profiles/entities/researcher-profile.entity';

/**
 * Detailed publication record fetched from WOS or Scopus.
 *
 * This entity is intentionally separate from `publications` (the yearly
 * counters loaded from Excel). The Excel only gives totals; this table
 * stores the actual papers with title, journal, quartile, citations,
 * etc. — the data needed to power the "detail" views in the frontend.
 *
 * Uniqueness:
 *   We deduplicate per (sourcePlatform, externalPublicationId) so
 *   re-syncing the same researcher does not create duplicate rows.
 *   Note that the same paper may legitimately exist twice in this table
 *   if it appears in both WOS and Scopus — that is by design, because
 *   each platform may assign a different quartile or even title casing,
 *   and we want to preserve both versions for traceability.
 */
@Entity({ name: 'publication_details' })
@Unique('UQ_publication_source', ['sourcePlatform', 'externalPublicationId'])
export class PublicationDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Full article title as returned by the source platform. */
  @Column({ type: 'text' })
  title: string;

  /** Journal / source title (`prism:publicationName` in Scopus, `source.title` in WoS). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  journal: string | null;

  /** ISSN reported by the platform. Used to resolve the quartile. */
  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  issn: string | null;

  /** Year of publication. Indexed because chart aggregations group by year. */
  @Index()
  @Column({ type: 'int' })
  year: number;

  /**
   * Quartile (Q1..Q4) from Scimago for the journal's MAIN category.
   * `null` when the ISSN was not present in the Scimago dataset
   * (book chapters, conference proceedings, very new journals, etc.).
   */
  @Column({ type: 'varchar', length: 5, nullable: true })
  quartile: string | null;

  /** Scimago "main category" name, kept for transparency. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  mainCategory: string | null;

  /** DOI when available — useful for linking out from the UI. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  doi: string | null;

  /** Citation count reported at fetch time. */
  @Column({ type: 'int', default: 0 })
  citedByCount: number;

  /** "WOS" or "SCOPUS" — matches Platform.code values. */
  @Index()
  @Column({ type: 'varchar', length: 50 })
  sourcePlatform: string;

  /**
   * Stable identifier assigned by the platform to the publication
   * (WoS UT, Scopus EID). Together with `sourcePlatform` forms the
   * unique key used for idempotent upserts.
   */
  @Column({ type: 'varchar', length: 100 })
  externalPublicationId: string;

  /** Profile through which this publication was discovered. */
  @ManyToOne(() => ResearcherProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: ResearcherProfile;

  @CreateDateColumn()
  fetchedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
