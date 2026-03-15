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

  @ApiProperty({ example: 'fivem', description: 'Tipo de juego libre. El frontend puede sugerir valores comunes.' })
  @IsNotEmpty()
  @IsString()
  game_type: string;

  @ApiProperty({ example: 'script', description: 'Tipo de servicio libre. El frontend puede sugerir valores comunes.' })
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
