import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Publication } from '../publications/entities/publication.entity';
import { Researcher } from '../researchers/entities/researcher.entity';
import {
  ResearcherChartSeries,
  YearlyPublicationPoint,
} from './dto/chart.dto';

/**
 * Read-only aggregations powering the front-end charts.
 *
 * Single responsibility: expose ready-to-plot data structures. It never
 * mutates the database — every method is a SELECT.
 *
 * The aggregations are written with TypeORM's QueryBuilder rather than
 * loading entities, because the result-set is small and shapes don't
 * map cleanly to a single entity hierarchy.
 */
@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(Publication)
    private readonly publicationRepository: Repository<Publication>,
    @InjectRepository(Researcher)
    private readonly researcherRepository: Repository<Researcher>,
  ) {}

  /**
   * Returns the total publication count per year per researcher,
   * regardless of platform. Used by the "Yearly publications" chart on
   * the dashboard.
   *
   * Output shape (one entry per researcher):
   *   { researcherId, fullName, points: [{ year, count }, ...] }
   *
   * Years that have zero publications across all platforms are omitted —
   * the front-end can pad them if a continuous X axis is required.
   */
  async getYearlyPublicationsPerResearcher(): Promise<
    Array<{
      researcherId: string;
      fullName: string;
      points: YearlyPublicationPoint[];
    }>
  > {
    const raw = await this.publicationRepository
      .createQueryBuilder('pub')
      .innerJoin('pub.profile', 'profile')
      .innerJoin('profile.researcher', 'researcher')
      .select('researcher.id', 'researcherId')
      .addSelect('researcher.firstName', 'firstName')
      .addSelect('researcher.lastName', 'lastName')
      .addSelect('pub.year', 'year')
      .addSelect('SUM(pub.count)', 'total')
      .groupBy('researcher.id')
      .addGroupBy('researcher.firstName')
      .addGroupBy('researcher.lastName')
      .addGroupBy('pub.year')
      .orderBy('researcher.lastName', 'ASC')
      .addOrderBy('pub.year', 'ASC')
      .getRawMany<{
        researcherId: string;
        firstName: string;
        lastName: string;
        year: string;
        total: string;
      }>();

    // Group raw rows by researcher into the chart-friendly shape.
    const grouped = new Map<
      string,
      { researcherId: string; fullName: string; points: YearlyPublicationPoint[] }
    >();

    for (const r of raw) {
      const key = r.researcherId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          researcherId: r.researcherId,
          fullName: `${r.firstName} ${r.lastName}`.trim(),
          points: [],
        });
      }
      grouped.get(key)!.points.push({
        year: Number(r.year),
        count: Number(r.total),
      });
    }
    return Array.from(grouped.values());
  }

  /**
   * Returns one chart series per researcher with one curve per platform
   * (WOS, SCOPUS) plus a synthesised "TOTAL" curve. This is the format
   * consumed by the per-researcher detail page.
   */
  async getChartSeriesPerResearcher(): Promise<ResearcherChartSeries[]> {
    const researchers = await this.researcherRepository.find({
      relations: ['profiles', 'profiles.platform', 'profiles.publications'],
      order: { lastName: 'ASC' },
    });

    return researchers.map((researcher) => {
      const totalsByYear = new Map<number, number>();

      const platformSeries = researcher.profiles.map((profile) => {
        const points: YearlyPublicationPoint[] = profile.publications
          .map((pub) => ({ year: pub.year, count: pub.count }))
          .sort((a, b) => a.year - b.year);

        // Accumulate into the synthetic TOTAL curve.
        for (const p of points) {
          totalsByYear.set(p.year, (totalsByYear.get(p.year) ?? 0) + p.count);
        }

        return {
          platformCode: profile.platform.code,
          points,
        };
      });

      const totalSeries: YearlyPublicationPoint[] = Array.from(
        totalsByYear.entries(),
      )
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => a.year - b.year);

      return {
        researcherId: researcher.id,
        fullName: `${researcher.firstName} ${researcher.lastName}`.trim(),
        series: [...platformSeries, { platformCode: 'TOTAL', points: totalSeries }],
      };
    });
  }

  /**
   * Returns the global publications-per-year totals (everyone, every
   * platform combined). Useful for a stacked or single-curve overview
   * chart on the home page.
   */
  async getGlobalYearlyTotals(): Promise<YearlyPublicationPoint[]> {
    const rows = await this.publicationRepository
      .createQueryBuilder('pub')
      .select('pub.year', 'year')
      .addSelect('SUM(pub.count)', 'total')
      .groupBy('pub.year')
      .orderBy('pub.year', 'ASC')
      .getRawMany<{ year: string; total: string }>();

    return rows.map((r) => ({
      year: Number(r.year),
      count: Number(r.total),
    }));
  }
}
