import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicationDetail } from './entities/publication-detail.entity';
import { PublicationAuthorship } from './entities/publication-authorship.entity';
import { PublicationDetailsService } from './publication-details.service';
import { PublicationDetailsController } from './publication-details.controller';
import { SjrResolverModule } from '../sjr-resolver/sjr-resolver.module';
import { ScopusFetcherModule } from '../scopus-fetcher/scopus-fetcher.module';
import { WosFetcherModule } from '../wos-fetcher/wos-fetcher.module';

/**
 * PublicationDetails module.
 *
 * `forwardRef` on the fetcher imports breaks the circular dependency:
 * fetchers depend on `PublicationDetailsService` to upsert papers, and
 * this controller depends on the fetchers to trigger the rebuild. Nest
 * resolves the cycle at runtime.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PublicationDetail, PublicationAuthorship]),
    SjrResolverModule,
    forwardRef(() => ScopusFetcherModule),
    forwardRef(() => WosFetcherModule),
  ],
  controllers: [PublicationDetailsController],
  providers: [PublicationDetailsService],
  exports: [PublicationDetailsService],
})
export class PublicationDetailsModule {}
