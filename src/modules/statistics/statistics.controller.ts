import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { StatisticsService } from './statistics.service';

@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  /**
   * GET /statistics/yearly-per-researcher
   * → Publications per year per researcher (deduplicated across platforms,
   *   counts each paper once even if co-authored by multiple UCN people).
   */
  @Get('yearly-per-researcher')
  yearlyPerResearcher() {
    return this.statisticsService.getYearlyPublicationsPerResearcher();
  }

  /**
   * GET /statistics/global-yearly
   * → Institution-wide totals per year for the dashboard summary chart.
   */
  @Get('global-yearly')
  globalYearly() {
    return this.statisticsService.getGlobalYearlyTotals();
  }

  /**
   * GET /statistics/counterfactual/:researcherId
   * → What the institution loses if this researcher leaves.
   *
   * Returns:
   *   - totalPublications
   *   - publicationsExclusiveToHim
   *   - publicationsCoAuthoredWithOtherUcn
   *   - citationsLost
   *   - quartileDistributionLost: { Q1, Q2, Q3, Q4, none }
   *   - yearlyImpactLost: [{ year, publications, citations }]
   *   - collaboratorsAffected: [{ researcherId, fullName, sharedPapers }]
   */
  @Get('counterfactual/:researcherId')
  counterfactual(@Param('researcherId', ParseUUIDPipe) researcherId: string) {
    return this.statisticsService.getCounterfactual(researcherId);
  }
}
