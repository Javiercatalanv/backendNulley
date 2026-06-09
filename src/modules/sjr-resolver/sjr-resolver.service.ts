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
 * What the resolver returns when an ISSN matches a journal in the
 * Scimago dataset. `mainQuartile` follows the "main category" rule
 * agreed with the product team: the first category listed for the
 * journal is its primary category, and we keep that quartile.
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
 * Loads the Scimago Journal Rank CSV (downloaded yearly from
 * https://www.scimagojr.com/journalrank.php) into memory at boot
 * and exposes an O(1) lookup by ISSN.
 *
 * Why local CSV instead of an API:
 *  - Scimago does NOT offer a public REST API for journal data.
 *  - The dataset is updated once a year, so caching is trivial.
 *  - Avoids adding an external dependency in the fetch pipeline.
 *
 * Why a single shared service:
 *  - Both `wos-fetcher` and `scopus-fetcher` resolve the SAME thing
 *    (quartile from ISSN), so duplicating the logic would be wasteful.
 */
@Injectable()
export class SjrResolverService implements OnModuleInit {
  private readonly logger = new Logger(SjrResolverService.name);

  /**
   * In-memory index. Keys are normalized ISSNs (no dashes, uppercase),
   * values are the resolved metadata. A journal can have multiple ISSNs
   * (print + online) — both are inserted pointing to the same entry.
   */
  private readonly issnIndex = new Map<string, SjrEntry>();

  /** Whether the CSV was found and loaded successfully on startup. */
  private isReady = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * NestJS lifecycle hook — runs once when the module finishes
   * initializing. Loading the CSV here (instead of lazily on the first
   * request) means the first publication fetch doesn't pay the cost
   * of parsing ~30k rows.
   */
  async onModuleInit(): Promise<void> {
    const csvPath = this.resolveCsvPath();
    if (!existsSync(csvPath)) {
      this.logger.warn(
        `Scimago CSV not found at ${csvPath}. ` +
          `Quartile resolution will be disabled. ` +
          `Download the latest CSV from https://www.scimagojr.com/journalrank.php ` +
          `and save it as data/scimago_journal_rank.csv`,
      );
      return;
    }

    try {
      this.loadCsv(csvPath);
      this.isReady = true;
      this.logger.log(
        `SJR Resolver ready — ${this.issnIndex.size} ISSN entries indexed`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to load Scimago CSV: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Public lookup method. Returns null when:
   *  - The CSV wasn't loaded (logged at boot).
   *  - The ISSN is empty or not found in the dataset.
   *
   * The caller decides what to do with a null result — typically store
   * the publication with `quartile = null` and move on.
   */
  resolveByIssn(issn: string | null | undefined): SjrEntry | null {
    if (!this.isReady || !issn) return null;
    const normalized = this.normalizeIssn(issn);
    return this.issnIndex.get(normalized) ?? null;
  }

  /**
   * Resolves the absolute path to the CSV. Reads from the
   * `SCIMAGO_CSV_PATH` env var if set, otherwise defaults to
   * `data/scimago_journal_rank.csv` relative to the project root.
   */
  private resolveCsvPath(): string {
    const fromEnv = this.configService.get<string>('SCIMAGO_CSV_PATH');
    if (fromEnv) return fromEnv;
    return join(process.cwd(), 'data', 'scimago_journal_rank.csv');
  }

  /**
   * Reads the file and parses every row.
   *
   * Scimago publishes the file with European conventions:
   *   - column separator: `;`
   *   - decimal separator: `,`
   *   - text fields wrapped in double quotes
   *
   * We need to be tolerant about the year embedded in column names
   * (e.g. `Total Docs. (2023)` changes each year), so we look up
   * columns by static names only when those names are guaranteed
   * stable across editions.
   */
  private loadCsv(path: string): void {
    const content = readFileSync(path, 'utf-8');
    const rows: Array<Record<string, string>> = parse(content, {
      delimiter: ';',
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
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

      // A row can have multiple ISSNs (print + online) separated by ", ".
      // We index the entry under each of them so any ISSN variant resolves.
      const issns = issnField.split(',').map((s) => this.normalizeIssn(s));
      for (const issn of issns) {
        if (issn) this.issnIndex.set(issn, entry);
      }
    }
  }

  /**
   * Normalizes an ISSN to a canonical form:
   *   - removes dashes/whitespace
   *   - uppercases the trailing check digit when it's an "X"
   *
   * Example: "0021-9258" → "00219258", "1083-351x" → "1083351X"
   */
  private normalizeIssn(raw: string): string {
    return raw.replace(/[\s-]/g, '').toUpperCase();
  }

  /**
   * Parses Scimago's European-formatted decimals ("0,123" → 0.123).
   * Returns null when the field is empty or unparseable so the caller
   * doesn't accidentally store `NaN`.
   */
  private parseEuropeanNumber(value: string | undefined): number | null {
    if (!value) return null;
    const normalized = value.replace(',', '.').trim();
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Parses the `Categories` column. Scimago formats it as a
   * semicolon-separated list where each entry optionally carries the
   * quartile in parentheses:
   *
   *   "Biochemistry (Q1); Cell Biology (Q2); Molecular Biology (Q1)"
   *
   * The FIRST item is the journal's primary category — that's what
   * we expose as `mainCategory` / `mainQuartile` per the product
   * decision to surface "main category" quartile instead of "best".
   *
   * Some categories arrive without a parenthesized quartile (e.g.
   * "Biochemistry; Cell Biology (Q2)"). In that case quartile is null.
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
      // Matches "<category> (<quartile>)" — the quartile group is optional.
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
