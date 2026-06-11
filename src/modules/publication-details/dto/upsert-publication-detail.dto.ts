/**
 * Contract used by fetchers (Scopus, WoS, ORCID) to hand a normalized
 * publication to the persistence layer.
 *
 * `profileId` identifies WHICH researcher this fetcher discovered the
 * paper through. The upsert service will:
 *   - Look up the paper by DOI first (cross-platform dedup) or by
 *     source-pair as a fallback.
 *   - Merge the new source into the paper's `sources` array.
 *   - Add a new authorship row linking the paper to this profile if
 *     the link doesn't already exist.
 *
 * Multiple fetchers calling `upsert` with different `profileId`s for
 * the same paper end up producing ONE paper row with MULTIPLE authors —
 * exactly what we lost in the previous design.
 */
export interface UpsertPublicationDetailInput {
  title: string;
  journal: string | null;
  issn: string | null;
  year: number;
  doi: string | null;
  citedByCount: number;
  sourcePlatform: string;
  externalPublicationId: string;
  profileId: string;
}
