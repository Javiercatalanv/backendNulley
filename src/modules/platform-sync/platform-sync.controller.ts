import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt.auth.guard';
import { PlatformSyncService } from './platform-sync.service';

/**
 * Endpoints para el botón de "Sincronizar WOS y Scopus" en el panel de
 * administración. Reemplazan la ejecución manual de:
 *   POST /wos-fetcher/sync
 *   POST /scopus-fetcher/sync
 * por comandos en la terminal, ya que en producción no habrá acceso a shell.
 *
 * Funcionan como un trabajo asíncrono: el POST arranca la sincronización en
 * background y responde de inmediato con un jobId; el GET se usa para
 * consultar el progreso (polling) hasta que el job termine.
 */
@Controller('platform-sync')
export class PlatformSyncController {
  constructor(private readonly platformSyncService: PlatformSyncService) {}

  /**
   * POST /platform-sync/sync-all
   * → arranca la sincronización de todos los perfiles WOS y Scopus
   *   registrados en la base de datos, en paralelo, en segundo plano.
   *   Responde 202 (Accepted) de inmediato con { id, status: 'running', ... }.
   *   Si ya hay un job corriendo, devuelve ese mismo job en vez de duplicarlo.
   *   Requiere sesión de administrador (JwtAuthGuard).
   */
  @Post('sync-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(202)
  startSync() {
    return this.platformSyncService.startSyncJob();
  }

  /**
   * GET /platform-sync/sync-all/:jobId
   * → consulta el estado de un job de sincronización ('running' | 'completed'
   *   | 'failed') y, cuando termina, el resumen de resultados por plataforma.
   *   Requiere sesión de administrador (JwtAuthGuard).
   */
  @Get('sync-all/:jobId')
  @UseGuards(JwtAuthGuard)
  getSyncStatus(@Param('jobId') jobId: string) {
    return this.platformSyncService.getJob(jobId);
  }
}