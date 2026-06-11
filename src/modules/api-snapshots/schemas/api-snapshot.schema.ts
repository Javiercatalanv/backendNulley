import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ApiSnapshotDocument = HydratedDocument<ApiSnapshot>;

/**
 * Raw JSON response captured from an external academic API.
 *
 * Purpose:
 *  - Avoid re-hitting the APIs (which have daily/weekly quotas) when we
 *    only need to re-parse or expose new fields locally.
 *  - Provide an audit trail of exactly what each platform returned at a
 *    given point in time.
 *  - Allow recovery of the relational `publication_details` table from
 *    these snapshots if it ever gets corrupted.
 *
 * Why MongoDB and not PostgreSQL:
 *  - The raw shape varies between platforms and evolves over time. A
 *    JSONB column in Postgres works too, but MongoDB is a better natural
 *    fit for nested, schemaless data.
 *
 * One document represents the FULL response for one sync of one profile.
 * If the API was paginated, all pages are merged into the `rawResponse`
 * array — we don't store one document per page (would explode the
 * collection and offer no value).
 *
 * IMPORTANT: every nullable / union-typed field declares `type: ...`
 * explicitly. Without it Mongoose can't infer the type from a TypeScript
 * union like `string | null` and crashes at startup with
 * `CannotDetermineTypeError`.
 */
@Schema({ collection: 'api_snapshots', timestamps: { createdAt: true, updatedAt: false } })
export class ApiSnapshot {
  /** Platform code — matches `Platform.code` in PostgreSQL (WOS / SCOPUS / ORCID). */
  @Prop({ type: String, required: true, index: true })
  platform: string;

  /** External identifier on that platform (Scopus AU-ID, WoS RID, ORCID iD). */
  @Prop({ type: String, required: true, index: true })
  externalId: string;

  /**
   * UUID of the `researcher_profiles` row that triggered this fetch.
   * Optional because some calls (the `test/` endpoints) don't have an
   * associated profile yet.
   *
   * `type: String` is mandatory here because the TypeScript type is a
   * union (`string | null`); without it Mongoose's reflection metadata
   * fails to resolve a concrete type.
   */
  @Prop({ type: String, required: false, default: null })
  researcherProfileId: string | null;

  /**
   * The raw payload. We store an array of "page" objects, so paginated
   * responses keep their original structure for traceability.
   *
   * Type is `any[]` because each platform has its own shape; Mongoose
   * keeps the structure intact thanks to `type: [Object]`.
   */
  @Prop({ type: [Object], default: [] })
  rawResponse: any[];

  /** Number of entries extracted from rawResponse (for quick stats). */
  @Prop({ type: Number, default: 0 })
  entryCount: number;

  /** Final outcome of the call. */
  @Prop({ type: String, enum: ['success', 'error'], default: 'success' })
  status: 'success' | 'error';

  /** Populated when status = 'error'; null on success. */
  @Prop({ type: String, default: null })
  errorMessage: string | null;
}

export const ApiSnapshotSchema = SchemaFactory.createForClass(ApiSnapshot);

// Compound index: looking up "the latest snapshot for this profile" is the
// most common access pattern, so we keep it cheap.
ApiSnapshotSchema.index({ platform: 1, externalId: 1, createdAt: -1 });