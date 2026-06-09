import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicationDetail } from './entities/publication-detail.entity';
import { PublicationDetailsService } from './publication-details.service';
import { PublicationDetailsController } from './publication-details.controller';
import { SjrResolverModule } from '../sjr-resolver/sjr-resolver.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PublicationDetail]),
    SjrResolverModule,
  ],
  controllers: [PublicationDetailsController],
  providers: [PublicationDetailsService],
  exports: [PublicationDetailsService],
})
export class PublicationDetailsModule {}
