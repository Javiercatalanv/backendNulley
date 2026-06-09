import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Application entry-point.
 *
 * Configures three cross-cutting concerns once and for all:
 *   - CORS so the front-end (likely on a different port) can call the API.
 *   - A global ValidationPipe that enforces every DTO's class-validator
 *     decorators automatically.
 *   - A global exception filter that turns every error into a consistent
 *     JSON shape.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not declared in DTOs
      forbidNonWhitelisted: true, // reject requests that include extras
      transform: true, // auto-convert primitives (e.g. UUIDs)
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
