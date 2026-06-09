import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelService } from '../excel/excel.service';

/**
 * Thin HTTP layer for file uploads. The actual parsing and persistence
 * are delegated to `ExcelService`, keeping this controller focused on
 * transport concerns (multipart parsing, MIME validation).
 */
@Controller('upload')
export class UploadController {
  /** Whitelist of MIME types accepted by the upload endpoint. */
  private static readonly ACCEPTED_MIMETYPES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/octet-stream', // genérico — algunos clientes mandan esto
  ];

  constructor(private readonly excelService: ExcelService) {}

  /**
   * POST /upload/excel — multipart/form-data with field name "file".
   *
   * Uses Multer's memory storage (the default for FileInterceptor without
   * options) so the buffer is processed in-memory and never written to
   * disk. For very large files this should be revisited.
   */
  @Post('excel')
  @UseInterceptors(FileInterceptor('file'))
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file received under field "file"');
    }

    const isAcceptedMime = UploadController.ACCEPTED_MIMETYPES.includes(
      file.mimetype,
    );
    const hasExcelExtension = /\.(xlsx|xls)$/i.test(file.originalname);

    if (!isAcceptedMime || !hasExcelExtension) {
      throw new BadRequestException(
        `Unsupported file: ${file.originalname} (${file.mimetype}). Expected an Excel file (.xlsx or .xls).`,
      );
    }

    return this.excelService.importFromBuffer(file.buffer, file.originalname);
  }
}
