import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

/**
 * Resolved entry returned to callers (fetchers).
 * `mainQuartile` follows the "main category" rule per product decision —
 * the first category listed for the journal is treated as primary.
 */
export interface SjrEntry {
  journalTitle: string;
  sjr: number | null;
  bestQuartile: string | null;
  mainCategory: string | null;
  mainQuartile: string | null;
  allCategories: Array<{ category: string; quartile: string | null }>;
}

/**
 * Loads the Scimago Journal Rank CSV into memory at boot and exposes an
 * O(1) lookup by ISSN.
 *
 * Scimago publishes the CSV with European conventions (semicolon as
 * column separator, comma as decimal separator, fields wrapped in
 * double quotes). Some editions ship with a handful of rows that have
 * malformed quotes — `csv-parse` aborts the whole file on the first
 * such row by default. We configure it to **skip and log** offending
 * rows instead, so the resolver still loads ~32k valid entries even
 * if 1-2 are corrupt.
 */
@Injectable()
export class SjrResolverService implements OnModuleInit {
  private readonly logger = new Logger(SjrResolverService.name);

  /** ISSN → SjrEntry. ISSNs are normalised (no dashes, uppercase). */
  private readonly issnIndex = new Map<string, SjrEntry>();
  private isReady = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Lifecycle hook: load the CSV once at boot so the first publication
   * fetch doesn't pay parsing latency. If the file is missing we log a
   * warning and keep going — fetchers will store publications with
   * `quartile: null` until the CSV is provided.
   */
  async onModuleInit(): Promise<void> {
    const csvPath = this.resolveCsvPath();
    if (!existsSync(csvPath)) {
      this.logger.warn(
        `Scimago CSV not found at ${csvPath}. Quartile resolution disabled. ` +
          `Download the latest CSV from https://www.scimagojr.com/journalrank.php ` +
          `and save it as data/scimago_journal_rank.csv`,
      );
      return;
    }

    try {
      const loaded = this.loadCsv(csvPath);
      this.isReady = true;
      this.logger.log(
        `SJR Resolver ready — ${this.issnIndex.size} ISSN entries indexed ` +
          `(from ${loaded.parsed} rows parsed, ${loaded.skipped} skipped due to malformed CSV)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to load Scimago CSV: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Public lookup. Returns null when the CSV wasn't loaded or the ISSN
   * isn't in the dataset (very new journals, book chapters, proceedings).
   */
  resolveByIssn(issn: string | null | undefined): SjrEntry | null {
    if (!this.isReady || !issn) return null;
    const normalized = this.normalizeIssn(issn);
    return this.issnIndex.get(normalized) ?? null;
  }

  /**
   * Resolves the path. Reads `SCIMAGO_CSV_PATH` env var or defaults to
   * `data/scimago_journal_rank.csv` relative to the project root.
   */
  private resolveCsvPath(): string {
    const fromEnv = this.configService.get<string>('SCIMAGO_CSV_PATH');
    if (fromEnv) return fromEnv;
    return join(process.cwd(), 'data', 'scimago_journal_rank.csv');
  }

  /**
   * Reads and parses the CSV. Tolerant of malformed rows: any row that
   * the parser can't handle gets skipped (and counted) rather than
   * aborting the whole load.
   *
   * Scimago CSV format:
   *   - column separator: `;`
   *   - decimal separator: `,`
   *   - text fields wrapped in `"..."`
   *   - occasional rows with unescaped quotes mid-field (the bug we
   *     work around with `skip_records_with_error: true`).
   */
  private loadCsv(path: string): { parsed: number; skipped: number } {
    const content = readFileSync(path, 'utf-8');

    // First count total non-empty lines (excluding header) to compute
    // how many were skipped due to parse errors.
    const totalDataLines =
      content.split('\n').filter((line) => line.trim().length > 0).length - 1;

    const rows: Array<Record<string, string>> = parse(content, {
      delimiter: ';',
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
      // Critical: instead of aborting on the first malformed row,
      // skip it and continue parsing the rest of the file.
      skip_records_with_error: true,
      // Hook called for each error-skipped row; useful for logging.
      on_record: (record, { lines }) => {
        // We could log every row here, but we keep it silent unless we
        // want to debug specific lines; the aggregate count is logged
        // by the caller via the returned numbers.
        return record;
      },
    });

    for (const row of rows) {
      const journalTitle = row['Title'];
      if (!journalTitle) continue;

      const issnField = row['Issn'] ?? '';
      const sjr = this.parseEuropeanNumber(row['SJR']);
      const bestQuartile = row['SJR Best Quartile'] || null;
      const { allCategories, mainCategory, mainQuartile } =
        this.parseCategories(row['Categories'] ?? '');

      const entry: SjrEntry = {
        journalTitle,
        sjr,
        bestQuartile,
        mainCategory,
        mainQuartile,
        allCategories,
      };

      // Journals can have multiple ISSNs (print + online); index each.
      const issns = issnField.split(',').map((s) => this.normalizeIssn(s));
      for (const issn of issns) {
        if (issn) this.issnIndex.set(issn, entry);
      }
    }

    return {
      parsed: rows.length,
      skipped: Math.max(0, totalDataLines - rows.length),
    };
  }

  /**
   * Canonical ISSN form: no dashes, no whitespace, uppercase trailing
   * "X" check digit.
   */
  private normalizeIssn(raw: string): string {
    return raw.replace(/[\s-]/g, '').toUpperCase();
  }

  /**
   * European decimal "0,123" → 0.123. Returns null on empty or invalid
   * input so callers never store NaN by accident.
   */
  private parseEuropeanNumber(value: string | undefined): number | null {
    if (!value) return null;
    const normalized = value.replace(',', '.').trim();
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Parses Scimago's Categories column:
   *
   *   "Biochemistry (Q1); Cell Biology (Q2); Molecular Biology (Q1)"
   *
   * The FIRST item is treated as the journal's primary category, so
   * `mainCategory` and `mainQuartile` come from there. Categories that
   * lack a parenthesised quartile get `quartile: null` (rare).
   */
  private parseCategories(raw: string): {
    allCategories: Array<{ category: string; quartile: string | null }>;
    mainCategory: string | null;
    mainQuartile: string | null;
  } {
    if (!raw.trim()) {
      return { allCategories: [], mainCategory: null, mainQuartile: null };
    }

    const items = raw.split(';').map((s) => s.trim()).filter(Boolean);
    const parsed = items.map((item) => {
      const match = item.match(/^(.+?)\s*\((Q[1-4])\)\s*$/);
      if (match) {
        return { category: match[1].trim(), quartile: match[2] };
      }
      return { category: item, quartile: null };
    });

    const main = parsed[0] ?? { category: null, quartile: null };
    return {
      allCategories: parsed,
      mainCategory: main.category,
      mainQuartile: main.quartile,
    };
  }
}