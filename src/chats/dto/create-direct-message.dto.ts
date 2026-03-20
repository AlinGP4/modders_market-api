import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDirectMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;
}
