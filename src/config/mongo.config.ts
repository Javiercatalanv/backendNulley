import { MongooseModuleOptions } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

/**
 * Factory that builds the Mongoose connection options for MongoDB.
 *
 * MongoDB is used here for non-structured data: raw rows of every Excel
 * import, file metadata, and import logs. This keeps a flexible, schemaless
 * audit trail without polluting the relational PostgreSQL schema.
 */
export const mongoConfig = (
  configService: ConfigService,
): MongooseModuleOptions => ({
  uri: configService.get<string>(
    'MONGO_URI',
    'mongodb://localhost:27017/research_imports',
  ),
});
