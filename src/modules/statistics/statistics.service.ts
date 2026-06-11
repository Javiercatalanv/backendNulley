import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Researcher } from '../researchers/entities/researcher.entity';
import { PublicationDetail } from '../publication-details/entities/publication-detail.entity';
import {
  CounterfactualImpact,
  ResearcherYearlySeries,
  YearlyPublicationPoint,
} from './dto/chart.dto';

/**
 * Read-only aggregations for the frontend.
 *
 * After the co-authorship refactor, chart aggregations go through the
 * `publication_authorships` join (a paper attributed to multiple UCN
 * researchers counts towards each of their series).
 *
 * Adds the `getCounterfactual` method, which powers the "what if this
 * researcher wasn't there" feature.
 */
@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(PublicationDetail)
    private readonly publicationRepository: Repository<PublicationDetail>,
    @InjectRepository(Researcher)
    private readonly researcherRepository: Repository<Researcher>,
  ) {}

  /**
   * Publications per year per researcher, computed from
   * `publication_details` joined via `publication_authorships`.
   *
   * One paper co-authored by two researchers counts for both — that's
   * the desired behaviour for "papers I contributed to" charts.
   */
  async getYearlyPublicationsPerResearcher(): Promise<ResearcherYearlySeries[]> {
    const rows = await this.publicationRepository
      .createQueryBuilder('pd')
      .innerJoin('pd.authorships', 'auth')
      .innerJoin('auth.profile', 'profile')
      .innerJoin('profile.researcher', 'researcher')
      .select('researcher.id', 'researcherId')
      .addSelect('researcher.firstName', 'firstName')
      .addSelect('researcher.lastName', 'lastName')
      .addSelect('pd.year', 'year')
      // COUNT(DISTINCT pd.id) is important: even if a researcher has
      // two `authorships` rows for the same paper (one via Scopus and
      // one via WoS) we only count it once.
      .addSelect('COUNT(DISTINCT pd.id)', 'total')
      .groupBy('researcher.id')
      .addGroupBy('researcher.firstName')
      .addGroupBy('researcher.lastName')
      .addGroupBy('pd.year')
      .orderBy('researcher.lastName', 'ASC')
      .addOrderBy('pd.year', 'ASC')
      .getRawMany<{
        researcherId: string;
        firstName: string;
        lastName: string;
        year: string;
        total: string;
      }>();

    const grouped = new Map<string, ResearcherYearlySeries>();
    for (const r of rows) {
      if (!grouped.has(r.researcherId)) {
        grouped.set(r.researcherId, {
          researcherId: r.researcherId,
          fullName: `${r.firstName} ${r.lastName}`.trim(),
          points: [],
        });
      }
      grouped.get(r.researcherId)!.points.push({
        year: Number(r.year),
        count: Number(r.total),
      });
    }
    return Array.from(grouped.values());
  }

  /**
   * Institution-wide totals per year (everyone combined, deduplicated).
   * Used by the dashboard summary chart.
   */
  async getGlobalYearlyTotals(): Promise<YearlyPublicationPoint[]> {
    const rows = await this.publicationRepository
      .createQueryBuilder('pd')
      .select('pd.year', 'year')
      .addSelect('COUNT(*)', 'total')
      .groupBy('pd.year')
      .orderBy('pd.year', 'ASC')
      .getRawMany<{ year: string; total: string }>();
    return rows.map((r) => ({
      year: Number(r.year),
      count: Number(r.total),
    }));
  }

  /**
   * Counterfactual analysis: what would the institution lose if this
   * researcher wasn't part of it?
   *
   * Definitions:
   *  - "Exclusive papers" = papers where this researcher is the only
   *    UCN author on file. These would be lost entirely.
   *  - "Co-authored with UCN" = papers also signed by other tracked
   *    researchers. These survive but lose an author.
   *
   * Note: the analysis only knows about UCN researchers we already
   * track. A paper with one UCN author + non-UCN co-authors counts as
   * "exclusive" because we have no record of the external co-authors.
   * This is acceptable for the institutional analytics use-case.
   */
  async getCounterfactual(researcherId: string): Promise<CounterfactualImpact> {
    const researcher = await this.researcherRepository.findOne({
      where: { id: researcherId },
    });
    if (!researcher) {
      throw new NotFoundException(`Researcher ${researcherId} not found`);
    }
    const fullName = `${researcher.firstName} ${researcher.lastName}`.trim();

    // 1. Load every publication this researcher contributed to, with
    //    all the other UCN co-authors eager-loaded so we can classify.
    const publications = await this.publicationRepository
      .createQueryBuilder('pd')
      .innerJoin('pd.authorships', 'targetAuth')
      .innerJoin('targetAuth.profile', 'targetProfile')
      .where('targetProfile.researcher_id = :rid', { rid: researcherId })
      .leftJoinAndSelect('pd.authorships', 'allAuth')
      .leftJoinAndSelect('allAuth.profile', 'allProfile')
      .leftJoinAndSelect('allProfile.researcher', 'allResearcher')
      .getMany();

    // 2. Classify each paper.
    const collaboratorsMap = new Map<
      string,
      { researcherId: string; fullName: string; sharedPapers: number }
    >();
    const quartileLost = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, none: 0 };
    const yearlyMap = new Map<
      number,
      { publications: number; citations: number }
    >();
    let exclusive = 0;
    let coAuthored = 0;
    let citationsLost = 0;

    for (const pub of publications) {
      // Distinct UCN co-authors (excluding the target researcher).
      const otherUcnAuthors = new Map<
        string,
        { researcherId: string; fullName: string }
      >();
      for (const a of pub.authorships ?? []) {
        const r = a.profile?.researcher;
        if (!r || r.id === researcherId) continue;
        if (!otherUcnAuthors.has(r.id)) {
          otherUcnAuthors.set(r.id, {
            researcherId: r.id,
            fullName: `${r.firstName} ${r.lastName}`.trim(),
          });
        }
      }

      if (otherUcnAuthors.size === 0) {
        // Exclusive paper — lost in the counterfactual scenario.
        exclusive += 1;
        citationsLost += pub.citedByCount;

        const q = (pub.quartile as 'Q1' | 'Q2' | 'Q3' | 'Q4' | null) ?? null;
        if (q) quartileLost[q] += 1;
        else quartileLost.none += 1;

        const y = yearlyMap.get(pub.year) ?? { publications: 0, citations: 0 };
        y.publications += 1;
        y.citations += pub.citedByCount;
        yearlyMap.set(pub.year, y);
      } else {
        // Co-authored — survives but the collaborator(s) lose this author.
        coAuthored += 1;
        for (const co of otherUcnAuthors.values()) {
          const existing = collaboratorsMap.get(co.researcherId);
          if (existing) {
            existing.sharedPapers += 1;
          } else {
            collaboratorsMap.set(co.researcherId, {
              ...co,
              sharedPapers: 1,
            });
          }
        }
      }
    }

    const yearlyImpactLost = Array.from(yearlyMap.entries())
      .map(([year, v]) => ({
        year,
        publications: v.publications,
        citations: v.citations,
      }))
      .sort((a, b) => a.year - b.year);

    const collaboratorsAffected = Array.from(collaboratorsMap.values()).sort(
      (a, b) => b.sharedPapers - a.sharedPapers,
    );

    return {
      researcherId,
      fullName,
      totalPublications: publications.length,
      publicationsExclusiveToHim: exclusive,
      publicationsCoAuthoredWithOtherUcn: coAuthored,
      citationsLost,
      quartileDistributionLost: quartileLost,
      yearlyImpactLost,
      collaboratorsAffected,
    };
  }
}
