import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

/**
 * Factory that builds the TypeORM connection options for PostgreSQL.
 *
 * Returning a function (instead of a static object) allows NestJS to inject
 * the ConfigService and read the credentials from environment variables.
 *
 * `autoLoadEntities: true` makes every entity registered through
 * `TypeOrmModule.forFeature([...])` in feature modules be loaded automatically,
 * so we don't need to maintain a manual list of entities here.
 *
 * `synchronize` is set to true only in development. In production migrations
 * should be used to avoid accidental schema changes.
 */
export const postgresConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('POSTGRES_HOST', 'localhost'),
  port: configService.get<number>('POSTGRES_PORT', 5432),
  username: configService.get<string>('POSTGRES_USER', 'postgres'),
  password: configService.get<string>('POSTGRES_PASSWORD', 'postgres'),
  database: configService.get<string>('POSTGRES_DB', 'research_publications'),
  autoLoadEntities: true,
  synchronize: configService.get<string>('NODE_ENV') !== 'production',
  logging: false,
});
