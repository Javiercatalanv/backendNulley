/**
 * Shape of a single point used by the chart endpoints.
 * `count` is the number of publications a researcher published in `year`.
 */
export interface YearlyPublicationPoint {
  year: number;
  count: number;
}

/**
 * Per-researcher chart series. The `series` array holds one curve per
 * platform (WOS, SCOPUS) plus a synthesised "TOTAL" series, ready to be
 * fed straight into Chart.js / Recharts.
 */
export interface ResearcherChartSeries {
  researcherId: string;
  fullName: string;
  series: Array<{
    platformCode: string; // "WOS" | "SCOPUS" | "TOTAL"
    points: YearlyPublicationPoint[];
  }>;
}
