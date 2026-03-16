import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProposalDto {
  @ApiPropertyOptional({ example: 'Updated scope, milestones and delivery plan.' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ example: 120, description: 'Updated offered price in EUR' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  proposed_price?: number;

  @ApiPropertyOptional({ example: 6, description: 'Updated delivery time in days' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  proposed_days?: number;
}
