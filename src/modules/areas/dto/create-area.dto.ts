import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAreaDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(160)
  name: string;
}