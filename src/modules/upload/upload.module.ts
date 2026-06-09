import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { ExcelModule } from '../excel/excel.module';

/**
 * Upload module — owns nothing of its own except the HTTP route. The
 * heavy lifting belongs to ExcelModule, which is imported here.
 */
@Module({
  imports: [ExcelModule],
  controllers: [UploadController],
})
export class UploadModule {}
