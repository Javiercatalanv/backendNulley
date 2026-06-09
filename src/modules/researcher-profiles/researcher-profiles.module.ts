import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearcherProfile } from './entities/researcher-profile.entity';
import { ResearcherProfilesService } from './researcher-profiles.service';
import { ResearcherProfilesController } from './researcher-profiles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ResearcherProfile])],
  controllers: [ResearcherProfilesController],
  providers: [ResearcherProfilesService],
  exports: [ResearcherProfilesService],
})
export class ResearcherProfilesModule {}
