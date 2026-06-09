import { Injectable, BadRequestException } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';
import { ResearchersService } from '../researchers/researchers.service';
import { PlatformsService } from '../platforms/platforms.service';
import { ResearcherProfilesService } from '../researcher-profiles/researcher-profiles.service';
import { PublicationsService } from '../publications/publications.service';
import { ImportsService } from '../imports/imports.service';

/**
 * Parsed representation of a single row in the Excel sheet — used as
 * the internal contract between `parse()` and `persist()`. Keeping this
 * shape explicit makes the code easier to test: `parse()` is pure data
 * transformation, `persist()` is pure side-effects.
 */
interface ParsedRow {
  fullName: string;
  /**
   * One entry per platform present in the row. The array makes it easy
   * to add new platforms (Google Scholar, ORCID...) without touching the
   * persistence logic — only the column layout in `parseRow()` changes.
   */
  platforms: Array<{
    platformCode: string;
    externalId: string;
    publications: Array<{ year: number; count: number }>;
  }>;
}

/**
 * Single-responsibility service: knows how to turn an Excel buffer into
 * persisted Researcher / Profile / Publication rows in PostgreSQL and
 * an audit `ImportRecord` in MongoDB.
 *
 * The service is thin — it delegates every database write to the
 * appropriate domain service and never touches a repository directly.
 * That keeps the orchestration logic independent from how each entity
 * is actually stored.
 */
@Injectable()
export class ExcelService {
  /**
   * Layout of the Excel produced by the research office.
   * Columns are 1-indexed because exceljs uses 1-based indexing.
   *
   *   1: Name | 2: WOS ID | 3..8: WOS year counters | 9: WOS total
   *  10: SCOPUS ID | 11..16: SCOPUS year counters | 17: SCOPUS total
   *
   * Years are listed newest-first (2025, 2024, ..., 2020), matching
   * the column order in the source file.
   */
  private static readonly YEARS_COLUMN_ORDER = [
    2025, 2024, 2023, 2022, 2021, 2020,
  ];

  private static readonly LAYOUT = {
    nameCol: 1,
    platforms: [
      { code: 'WOS', idCol: 2, yearStartCol: 3 }, // years span cols 3..8
      { code: 'SCOPUS', idCol: 10, yearStartCol: 11 }, // years span cols 11..16
    ],
  };

  constructor(
    private readonly researchersService: ResearchersService,
    private readonly platformsService: PlatformsService,
    private readonly profilesService: ResearcherProfilesService,
    private readonly publicationsService: PublicationsService,
    private readonly importsService: ImportsService,
  ) {}

  /**
   * Top-level entry-point invoked by the upload controller.
   *
   * 1. Loads the workbook from the in-memory buffer (no temp file).
   * 2. Parses every data row into `ParsedRow` objects (pure function).
   * 3. Persists each row through the domain services (PostgreSQL).
   * 4. Stores an audit document in MongoDB regardless of outcome.
   *
   * Failures during persistence are captured per-row so a single bad row
   * doesn't abort the whole import — the audit record then reflects a
   * partial success.
   */
  async importFromBuffer(
    buffer: Buffer,
    originalFileName: string,
  ): Promise<{
    importId: string;
    summary: {
      researchersCreated: number;
      researchersUpdated: number;
      profilesCreated: number;
      publicationsUpserted: number;
    };
    errors: string[];
  }> {
    const workbook = new Workbook();
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    await workbook.xlsx.load(arrayBuffer as ArrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('The uploaded file has no worksheets');
    }

    const parsedRows = this.parseSheet(worksheet);
    const summary = {
      researchersCreated: 0,
      researchersUpdated: 0,
      profilesCreated: 0,
      publicationsUpserted: 0,
    };
    const errors: string[] = [];

    for (const row of parsedRows) {
      try {
        await this.persistRow(row, summary);
      } catch (err) {
        errors.push(
          `Row "${row.fullName}": ${(err as Error).message ?? 'unknown error'}`,
        );
      }
    }

    const status: 'success' | 'partial' | 'failed' =
      errors.length === 0
        ? 'success'
        : errors.length < parsedRows.length
          ? 'partial'
          : 'failed';

    const auditRecord = await this.importsService.create({
      originalFileName,
      sheetName: worksheet.name,
      rawRows: parsedRows as unknown as Record<string, unknown>[],
      summary,
      status,
      errorMessages: errors,
    });

    return {
      importId: auditRecord._id.toString(),
      summary,
      errors,
    };
  }

  /**
   * Walks the worksheet (skipping the header row and the totals row) and
   * turns every body row into a `ParsedRow`. Pure: no side-effects, no
   * DB calls — easy to unit-test against fixture buffers.
   */
  private parseSheet(worksheet: Worksheet): ParsedRow[] {
    const rows: ParsedRow[] = [];

    worksheet.eachRow((row, rowNumber) => {
      // Row 1 is the header. The "Total" footer is detected by the literal
      // value in the name column.
      if (rowNumber === 1) return;
      const nameCell = row.getCell(ExcelService.LAYOUT.nameCol).value;
      if (!nameCell || String(nameCell).trim().toLowerCase() === 'total') {
        return;
      }

      rows.push(this.parseRow(row));
    });

    return rows;
  }

  /**
   * Transforms a single exceljs row into our internal `ParsedRow` shape.
   * Centralises every assumption about the column layout in one place.
   */
  private parseRow(row: any): ParsedRow {
    const fullName = String(
      row.getCell(ExcelService.LAYOUT.nameCol).value,
    ).trim();

    const platforms = ExcelService.LAYOUT.platforms.map((platform) => {
      const externalId = String(row.getCell(platform.idCol).value ?? '').trim();
      const publications = ExcelService.YEARS_COLUMN_ORDER.map(
        (year, offset) => ({
          year,
          count: this.toInt(row.getCell(platform.yearStartCol + offset).value),
        }),
      );
      return {
        platformCode: platform.code,
        externalId,
        publications,
      };
    });

    return { fullName, platforms };
  }

  /**
   * Persists one parsed row through the domain services. Updates the
   * shared `summary` counters in-place so the caller can include them
   * in the audit record.
   */
  private async persistRow(
    row: ParsedRow,
    summary: {
      researchersCreated: number;
      researchersUpdated: number;
      profilesCreated: number;
      publicationsUpserted: number;
    },
  ): Promise<void> {
    const { firstName, lastName } = this.splitFullName(row.fullName);

    // 1. Resolve (or create) the researcher record itself.
    let researcher = await this.researchersService.findByFullName(
      firstName,
      lastName,
    );
    if (!researcher) {
      researcher = await this.researchersService.create({ firstName, lastName });
      summary.researchersCreated += 1;
    } else {
      summary.researchersUpdated += 1;
    }

    // 2. For every platform present in the row, ensure a profile exists
    //    and upsert the per-year publication counters.
    for (const p of row.platforms) {
      // An empty externalId (e.g. blank cell) means the researcher is not
      // present on this platform, so we skip the row.
      if (!p.externalId) continue;

      const platform = await this.platformsService.findByCode(p.platformCode);
      const profile = await this.profilesService.findOrCreate({
        researcherId: researcher.id,
        platformId: platform.id,
        externalId: p.externalId,
      });
      summary.profilesCreated += 1;

      await this.publicationsService.upsertManyForProfile(
        profile.id,
        p.publications,
      );
      summary.publicationsUpserted += p.publications.length;
    }
  }

  /**
   * Splits "Carlos Manzano" into ("Carlos", "Manzano") and
   * "Sarfaraz Hashemkhani Zolfani" into ("Sarfaraz", "Hashemkhani Zolfani").
   *
   * The Excel format only carries a single "Name" column, so we adopt the
   * simple convention: first whitespace token is the first name, rest is
   * the last name. Researchers can be updated manually afterwards from
   * the UI if a more accurate split is needed.
   */
  private splitFullName(fullName: string): {
    firstName: string;
    lastName: string;
  } {
    const tokens = fullName.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      throw new BadRequestException('Empty researcher name in row');
    }
    if (tokens.length === 1) {
      return { firstName: tokens[0], lastName: '' };
    }
    return {
      firstName: tokens[0],
      lastName: tokens.slice(1).join(' '),
    };
  }

  /**
   * Defensive number conversion: cells coming from Excel can be numbers,
   * strings, formulas (with `.result`), or null. This collapses them all
   * into a safe non-negative integer.
   */
  private toInt(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'number') return Math.max(0, Math.trunc(value));
    if (typeof value === 'object' && 'result' in (value as any)) {
      return this.toInt((value as any).result);
    }
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
}
