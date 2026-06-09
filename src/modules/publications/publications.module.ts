import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Publication } from './entities/publication.entity';
import { PublicationsService } from './publications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Publication])],
  providers: [PublicationsService],
  exports: [PublicationsService],
})
export class PublicationsModule {}
