import { Module } from '@nestjs/common';
import { SjrResolverService } from './sjr-resolver.service';

/**
 * SJR Resolver module — provides the singleton service that resolves
 * quartiles from ISSNs using the local Scimago dataset.
 *
 * No controller: this service is consumed only by other backend
 * modules (wos-fetcher, scopus-fetcher), never exposed via HTTP.
 */
@Module({
  providers: [SjrResolverService],
  exports: [SjrResolverService],
})
export class SjrResolverModule {}
