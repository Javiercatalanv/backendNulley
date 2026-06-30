export interface UpsertPublicationDetailInput {
  title: string;
  journal: string | null;
  issn: string | null;
  year: number;
  publishedDate?: string | null;
  doi: string | null;
  citedByCount: number;
  sourcePlatform: string;
  externalPublicationId: string;
  profileId: string;
}