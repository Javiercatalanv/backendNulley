import { IsUUID } from 'class-validator';

export class UpdateResearcherAreaDto {
  @IsUUID()
  areaId: string;
}