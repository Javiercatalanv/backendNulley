import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiSnapshot, ApiSnapshotSchema } from './schemas/api-snapshot.schema';
import { ApiSnapshotsService } from './api-snapshots.service';
import { ApiSnapshotsController } from './api-snapshots.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApiSnapshot.name, schema: ApiSnapshotSchema },
    ]),
  ],
  controllers: [ApiSnapshotsController],
  providers: [ApiSnapshotsService],
  exports: [ApiSnapshotsService],
})
export class ApiSnapshotsModule {}
