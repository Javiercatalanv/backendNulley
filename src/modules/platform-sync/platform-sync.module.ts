import { Module } from '@nestjs/common';
import { WosFetcherModule } from '../wos-fetcher/wos-fetcher.module';
import { ScopusFetcherModule } from '../scopus-fetcher/scopus-fetcher.module';
import { PlatformSyncController } from './platform-sync.controller';
import { PlatformSyncService } from './platform-sync.service';

// AuthModule es @Global, por eso JwtAuthGuard está disponible aquí sin
// necesidad de importarlo explícitamente (mismo patrón que UploadModule).
@Module({
  imports: [WosFetcherModule, ScopusFetcherModule],
  controllers: [PlatformSyncController],
  providers: [PlatformSyncService],
})
export class PlatformSyncModule {}