/**
 * Shape used by fetchers (wos-fetcher, scopus-fetcher) to hand a
 * normalized publication to the service for upserting.
 *
 * Keeping this as a plain interface — not a class with decorators —
 * because it's an internal contract between backend modules and never
 * touches the HTTP layer.
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
