import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ImportRecord,
  ImportRecordDocument,
} from './schemas/import-record.schema';

/**
 * Service responsible for the import audit trail kept in MongoDB.
 *
 * Has a single responsibility: read/write `ImportRecord` documents.
 * It knows nothing about Excel parsing or relational persistence — those
 * concerns live in `ExcelService` and the PostgreSQL services respectively.
 */
@Injectable()
export class ImportsService {
  constructor(
    @InjectModel(ImportRecord.name)
    private readonly importModel: Model<ImportRecordDocument>,
  ) {}

  /**
   * Persists a new import record. Called once at the end of every Excel
   * import (whether it succeeded or failed) so the original file content
   * and the resulting summary are always available for inspection.
   */
  create(payload: Partial<ImportRecord>): Promise<ImportRecordDocument> {
    return this.importModel.create(payload);
  }

  /**
   * Returns the most recent imports first. The page size is limited to
   * keep responses small — pagination can be added later if needed.
   */
  findRecent(limit = 20): Promise<ImportRecordDocument[]> {
    return this.importModel.find().sort({ createdAt: -1 }).limit(limit).exec();
  }

  /** Single import by id (used by the audit detail page). */
  findById(id: string): Promise<ImportRecordDocument | null> {
    return this.importModel.findById(id).exec();
  }
}
