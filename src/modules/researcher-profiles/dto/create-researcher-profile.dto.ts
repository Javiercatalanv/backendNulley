import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Body required to attach a new platform profile to an existing researcher.
 * The pair (researcherId, platformId) must be unique — that constraint is
 * enforced both at the DB level and in the service layer.
 */
export class CreateResearcherProfileDto {
  @IsUUID()
  researcherId: string;

  @IsUUID()
  platformId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  externalId: string;
}
