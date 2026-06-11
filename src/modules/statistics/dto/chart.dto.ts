/**
 * Output shapes for the chart and counterfactual endpoints.
 */

export interface YearlyPublicationPoint {
  year: number;
  count: number;
}

export interface ResearcherYearlySeries {
  researcherId: string;
  fullName: string;
  points: YearlyPublicationPoint[];
}

/**
 * Result of the "what if X researcher wasn't there" analysis.
 *
 * The numbers are computed from the deduplicated `publication_details`
 * + `publication_authorships` tables, so a paper co-authored by two
 * UCN researchers counts towards both — but only once per researcher.
 */
export interface CounterfactualImpact {
  researcherId: string;
  fullName: string;

  /** Total papers where this researcher is an author. */
  totalPublications: number;

  /** Papers where this researcher is the ONLY UCN author. Lost if they leave. */
  publicationsExclusiveToHim: number;

  /** Papers shared with other UCN researchers. Survive but lose this author. */
  publicationsCoAuthoredWithOtherUcn: number;

  /** Sum of `citedByCount` for the exclusive papers (citations the institution loses). */
  citationsLost: number;

  /** Distribution of the exclusive papers by quartile. */
  quartileDistributionLost: {
    Q1: number;
    Q2: number;
    Q3: number;
    Q4: number;
    none: number;
  };

  /** Per-year breakdown of the exclusive impact. */
  yearlyImpactLost: Array<{
    year: number;
    publications: number;
    citations: number;
  }>;

  /** Other UCN researchers who co-authored at least one paper with X. */
  collaboratorsAffected: Array<{
    researcherId: string;
    fullName: string;
    sharedPapers: number;
  }>;
}
