import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Validation contract for creating a new researcher through the API.
 * `class-validator` decorators are evaluated by the global ValidationPipe
 * registered in `main.ts`, so invalid bodies are rejected before reaching
 * the controller.
 */
export class CreateResearcherDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName: string;
}
