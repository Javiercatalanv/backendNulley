import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PublicationAuthorship } from './publication-authorship.entity';

/**
 * One published paper, deduplicated across platforms.
 *
 * Key changes from the previous version:
 *
 *  - Removed the single `profile` FK. Authorship is now modeled by the
 *    `publication_authorships` join table (many-to-many with profiles).
 *    A paper can therefore have multiple UCN authors at the same time,
 *    which is what the counterfactual analysis requires.
 *
 *  - Added `sources`: a JSON array tracking every platform/external-id
 *    pair under which the paper was discovered. Replaces the old
 *    `(sourcePlatform, externalPublicationId)` unique constraint.
 *
 *  - Added `url`: a precomputed link the frontend can use directly.
 *    Built from DOI when available, else from the platform-specific id.
 *
 *  - DOI is a unique partial index (only when non-null): two papers
 *    can't share a DOI, but many papers can legitimately have no DOI.
 *    This is the canonical cross-platform deduplication key.
 */
@Entity({ name: 'publication_details' })
export class PublicationDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  journal: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  issn: string | null;

  @Index()
  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'varchar', length: 5, nullable: true })
  quartile: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  mainCategory: string | null;

  /**
   * DOI is the canonical cross-platform identifier. Unique among
   * non-null values so the same paper showing up in WoS and Scopus
   * collapses into one row.
   */
  @Index('UQ_publication_doi', { unique: true, where: '"doi" IS NOT NULL' })
  @Column({ type: 'varchar', length: 200, nullable: true })
  doi: string | null;

  @Column({ type: 'int', default: 0 })
  citedByCount: number;

  /**
   * Every (platform, externalId) pair this paper was discovered as.
   * Example:
   *   [
   *     { "platform": "SCOPUS", "externalPublicationId": "2-s2.0-85123456789" },
   *     { "platform": "WOS",    "externalPublicationId": "WOS:000123456789012" }
   *   ]
   *
   * Stored as JSONB so we can query containment cheaply if needed.
   */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  sources: Array<{ platform: string; externalPublicationId: string }>;

  /**
   * Pre-built link for the frontend. Priority:
   *   1. https://doi.org/<doi>          (universal, always best)
   *   2. https://www.scopus.com/...     (when sourced from Scopus)
   *   3. https://www.webofscience.com   (when sourced from WoS)
   *
   * Lets the UI render <a href={pub.url}> without knowing platform rules.
   */
  @Column({ type: 'text', nullable: true })
  url: string | null;

  /**
   * Authorship rows linking this paper to UCN researchers. A paper can
   * have multiple authors here when several of the tracked UCN
   * researchers co-authored it. The set is empty for non-UCN authors —
   * we only persist authorships for profiles we already have on file.
   */
  @OneToMany(() => PublicationAuthorship, (a) => a.publication, {
    cascade: true,
  })
  authorships: PublicationAuthorship[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
