import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Mongoose document type alias — gives proper typings to repository
 * operations and to the controller responses.
 */
export type ImportRecordDocument = HydratedDocument<ImportRecord>;

/**
 * Audit record for a single Excel import attempt, persisted in MongoDB.
 *
 * Why MongoDB and not PostgreSQL? Because the relevant data here —
 * arbitrary spreadsheet rows, error messages, free-form file metadata —
 * is schemaless by nature. Forcing it into relational tables would
 * either lose information or require lots of JSONB columns. MongoDB is
 * a much better fit for this audit / traceability use-case.
 *
 * Each record stores:
 *  - `originalFileName`  — the file the user uploaded
 *  - `sheetName`         — the worksheet that was processed
 *  - `rawRows`           — every row parsed from the Excel, untouched
 *  - `summary`           — counters about what was created/updated
 *  - `status`            — final outcome of the import
 *  - `errorMessages`     — any errors raised during parsing/persisting
 */
@Schema({ collection: 'import_records', timestamps: true })
export class ImportRecord {
  @Prop({ required: true })
  originalFileName: string;

  @Prop({ required: true })
  sheetName: string;

  /** All rows parsed from the Excel, kept as-is for traceability. */
  @Prop({ type: Array, default: [] })
  rawRows: Record<string, unknown>[];

  @Prop({
    type: {
      researchersCreated: { type: Number, default: 0 },
      researchersUpdated: { type: Number, default: 0 },
      profilesCreated: { type: Number, default: 0 },
      publicationsUpserted: { type: Number, default: 0 },
    },
    default: () => ({}),
  })
  summary: {
    researchersCreated: number;
    researchersUpdated: number;
    profilesCreated: number;
    publicationsUpserted: number;
  };

  @Prop({ enum: ['success', 'partial', 'failed'], default: 'success' })
  status: 'success' | 'partial' | 'failed';

  @Prop({ type: [String], default: [] })
  errorMessages: string[];
}

export const ImportRecordSchema = SchemaFactory.createForClass(ImportRecord);
