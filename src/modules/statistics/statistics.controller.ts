import { Controller, Get } from '@nestjs/common';
import { StatisticsService } from './statistics.service';

/**
 * Endpoints consumed by the front-end charts.
 *
 * All routes are GET-only — the data they return is computed on the fly
 * from the relational tables, so changes to the underlying data are
 * reflected immediately on the next request.
 */
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  /**
   * GET /statistics/yearly-per-researcher
   * → publications per year per researcher (totals across platforms).
   */
  @Get('yearly-per-researcher')
  yearlyPerResearcher() {
    return this.statisticsService.getYearlyPublicationsPerResearcher();
  }

  /**
   * GET /statistics/researcher-series
   * → per-researcher series with one curve per platform plus a TOTAL.
   */
  @Get('researcher-series')
  researcherSeries() {
    return this.statisticsService.getChartSeriesPerResearcher();
  }

  /**
   * GET /statistics/global-yearly
   * → single curve with the institution-wide totals per year.
   */
  @Get('global-yearly')
  globalYearly() {
    return this.statisticsService.getGlobalYearlyTotals();
  }
}
