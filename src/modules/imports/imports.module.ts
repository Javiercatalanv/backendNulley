import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ImportRecord,
  ImportRecordSchema,
} from './schemas/import-record.schema';
import { ImportsService } from './imports.service';
import { ImportsController } from './imports.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImportRecord.name, schema: ImportRecordSchema },
    ]),
  ],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
