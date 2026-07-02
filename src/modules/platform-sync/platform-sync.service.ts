import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WosFetcherService, WosSyncResult } from '../wos-fetcher/wos-fetcher.service';
import { ScopusFetcherService, ScopusSyncResult } from '../scopus-fetcher/scopus-fetcher.service';

export interface PlatformSyncOutcome<T> {
  status: 'ok' | 'error';
  profilesProcessed: number;
  fetched: number;
  stored: number;
  errors: string[];
  results: T[];
  failureReason?: string;
}

export interface PlatformSyncSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  wos: PlatformSyncOutcome<WosSyncResult>;
  scopus: PlatformSyncOutcome<ScopusSyncResult>;
}

export type SyncJobStatus = 'running' | 'completed' | 'failed';

export interface SyncJob {
  id: string;
  status: SyncJobStatus;
  startedAt: string;
  finishedAt: string | null;
  result: PlatformSyncSummary | null;
  error: string | null;
}

/**
 * Orquesta la sincronización de WOS y Scopus como un trabajo en segundo
 * plano (fire-and-forget + polling), en vez de una llamada HTTP síncrona.
 *
 * Antes esto se hacía a mano en el servidor, ejecutando:
 *   curl -X POST http://localhost:3000/wos-fetcher/sync
 *   curl -X POST http://localhost:3000/scopus-fetcher/sync
 *
 * Ahora el botón de administración dispara `startSyncJob()`, que responde
 * de inmediato con un jobId, mientras la sincronización real corre en
 * background. El frontend consulta `getJob(jobId)` cada pocos segundos
 * hasta que el estado sea 'completed' o 'failed'.
 *
 * NOTA DE ESCALABILIDAD: los jobs se guardan en un Map en memoria del
 * proceso. Esto es suficiente mientras el backend corra en una sola
 * instancia. Si en el futuro se despliega con varias instancias/réplicas
 * detrás de un load balancer, este Map debe moverse a un almacenamiento
 * compartido (Redis, una tabla en Postgres, o una cola como BullMQ) para
 * que cualquier instancia pueda responder el polling del estado del job.
 */
@Injectable()
export class PlatformSyncService {
  private readonly logger = new Logger(PlatformSyncService.name);
  private readonly jobs = new Map<string, SyncJob>();
  private static readonly MAX_JOBS_IN_MEMORY = 20;

  constructor(
    private readonly wosFetcherService: WosFetcherService,
    private readonly scopusFetcherService: ScopusFetcherService,
  ) {}

  /**
   * Crea un nuevo job de sincronización y lo arranca en background.
   * Si ya hay un job corriendo, devuelve ese mismo job en vez de arrancar
   * uno nuevo (evita duplicar llamadas a las APIs externas si alguien
   * hace doble clic en el botón, o si dos administradores lo disparan
   * casi al mismo tiempo).
   */
  startSyncJob(): SyncJob {
    const runningJob = this.findRunningJob();
    if (runningJob) {
      this.logger.log(`Sync already running (job ${runningJob.id}); reusing it`);
      return runningJob;
    }

    const job: SyncJob = {
      id: randomUUID(),
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    };

    this.jobs.set(job.id, job);
    this.pruneOldJobs();

    this.logger.log(`Starting sync job ${job.id}`);

    // Fire-and-forget: no bloquea la respuesta HTTP del controller.
    // Cualquier error queda capturado dentro de runJob y guardado en el job.
    void this.runJob(job.id);

    return job;
  }

  /**
   * Devuelve el estado actual de un job (para que el frontend haga polling).
   */
  getJob(jobId: string): SyncJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException(`Sync job ${jobId} not found`);
    }
    return job;
  }

  private findRunningJob(): SyncJob | undefined {
    return [...this.jobs.values()].find((j) => j.status === 'running');
  }

  private async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.result = await this.syncAll();
      job.status = 'completed';
      this.logger.log(`Sync job ${jobId} completed`);
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : 'Unknown error while syncing';
      this.logger.error(`Sync job ${jobId} failed: ${job.error}`);
    } finally {
      job.finishedAt = new Date().toISOString();
    }
  }

  /** Elimina los jobs más antiguos si superamos el límite en memoria. */
  private pruneOldJobs(): void {
    if (this.jobs.size <= PlatformSyncService.MAX_JOBS_IN_MEMORY) return;

    const sortedByStartDate = [...this.jobs.entries()].sort(
      (a, b) => a[1].startedAt.localeCompare(b[1].startedAt),
    );
    const excessCount = sortedByStartDate.length - PlatformSyncService.MAX_JOBS_IN_MEMORY;
    for (const [id] of sortedByStartDate.slice(0, excessCount)) {
      this.jobs.delete(id);
    }
  }

  private async syncAll(): Promise<PlatformSyncSummary> {
    const startedAt = new Date();
    this.logger.log('Starting combined WOS + Scopus synchronization');

    const [wos, scopus] = await Promise.all([this.runWos(), this.runScopus()]);

    const finishedAt = new Date();

    this.logger.log(
      `Combined synchronization finished in ${finishedAt.getTime() - startedAt.getTime()}ms ` +
        `(WOS: ${wos.status}, Scopus: ${scopus.status})`,
    );

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      wos,
      scopus,
    };
  }

  private async runWos(): Promise<PlatformSyncOutcome<WosSyncResult>> {
    try {
      const results = await this.wosFetcherService.syncAllProfiles();
      return this.summarize(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error while syncing WOS';
      this.logger.error(`WOS sync failed: ${message}`);
      return {
        status: 'error',
        profilesProcessed: 0,
        fetched: 0,
        stored: 0,
        errors: [],
        results: [],
        failureReason: message,
      };
    }
  }

  private async runScopus(): Promise<PlatformSyncOutcome<ScopusSyncResult>> {
    try {
      const results = await this.scopusFetcherService.syncAllProfiles();
      return this.summarize(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error while syncing Scopus';
      this.logger.error(`Scopus sync failed: ${message}`);
      return {
        status: 'error',
        profilesProcessed: 0,
        fetched: 0,
        stored: 0,
        errors: [],
        results: [],
        failureReason: message,
      };
    }
  }

  private summarize<T extends { fetched: number; stored: number; errors: string[] }>(
    results: T[],
  ): PlatformSyncOutcome<T> {
    return {
      status: 'ok',
      profilesProcessed: results.length,
      fetched: results.reduce((sum, r) => sum + (r.fetched || 0), 0),
      stored: results.reduce((sum, r) => sum + (r.stored || 0), 0),
      errors: results.flatMap((r) => r.errors || []),
      results,
    };
  }
}