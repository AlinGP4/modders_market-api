// src/jobs/dto/create-job.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateJobDto {
  @ApiProperty({ example: 'Job ladrón casas FiveM', description: 'Título del encargo' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'Job ESX completo con ox_inventory', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'fivem', enum: ['fivem', 'minecraft', 'gta'] })
  @IsNotEmpty()
  @IsString()
  game_type: string;

  @ApiProperty({ example: 'script', enum: ['script', 'plugin', 'mlo', 'car', 'ui'] })
  @IsNotEmpty()
  @IsString()
  task_type: string;

  @ApiProperty({ example: 80, description: 'Presupuesto mínimo €' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  budget_min?: number;

  @ApiProperty({ example: 150, description: 'Presupuesto máximo €' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  budget_max?: number;

  @ApiProperty({ example: 7, description: 'Días estimados' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration_days?: number;
}
