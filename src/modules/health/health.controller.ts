import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Health check para monitoreo en producción.
 * GET /health        → estado básico (la app responde).
 * GET /health/ready  → readiness: además verifica conexión a PostgreSQL.
 */
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    let db = 'down';
    try {
      // Una query trivial confirma que la base responde.
      await this.dataSource.query('SELECT 1');
      db = 'up';
    } catch {
      db = 'down';
    }
    const ok = db === 'up';
    return {
      status: ok ? 'ok' : 'degraded',
      database: db,
      timestamp: new Date().toISOString(),
    };
  }
}