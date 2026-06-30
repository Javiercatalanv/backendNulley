import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Researcher } from './entities/researcher.entity';
import { ResearchersService } from './researchers.service';
import { ResearchersController } from './researchers.controller';

// AuthModule es @Global, por eso JwtAuthGuard está disponible aquí
// sin necesidad de importarlo explícitamente.
@Module({
  imports: [TypeOrmModule.forFeature([Researcher])],
  controllers: [ResearchersController],
  providers: [ResearchersService],
  exports: [ResearchersService],
})
export class ResearchersModule {}