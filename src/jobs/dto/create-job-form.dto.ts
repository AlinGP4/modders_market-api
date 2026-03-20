import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateJobFormDto {
  @ApiProperty({ example: 'Job ladrón casas FiveM', description: 'Título del encargo' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Job ESX completo con ox_inventory' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'fivem',
    description: 'Tipo de juego libre. El frontend puede sugerir valores comunes.',
  })
  @IsNotEmpty()
  @IsString()
  game_type: string;

  @ApiProperty({
    example: 'script',
    description: 'Tipo de servicio libre. El frontend puede sugerir valores comunes.',
  })
  @IsNotEmpty()
  @IsString()
  task_type: string;

  @ApiPropertyOptional({ example: 80, description: 'Presupuesto mínimo €' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  budget_min?: number;

  @ApiPropertyOptional({ example: 150, description: 'Presupuesto máximo €' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  budget_max?: number;

  @ApiPropertyOptional({ example: 7, description: 'Días estimados' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  duration_days?: number;

  @ApiPropertyOptional({
    example: 0,
    description: 'Índice de la imagen seleccionada como portada dentro del array images.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cover_image_index?: number;
}
