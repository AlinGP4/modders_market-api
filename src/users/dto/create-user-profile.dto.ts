
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsArray, ArrayMinSize, IsIn } from 'class-validator';

export class CreateUserProfileDto {
  @ApiProperty({ example: 'JokerDev' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'FiveM scripts pro', required: false })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiProperty({ example: ['fivem_scripts'], description: 'Especialidades' })
  @IsArray()
  @ArrayMinSize(1)
  specialties: string[];

  @ApiProperty({ example: ['fivem'], description: 'Juegos' })
  @IsArray()
  games: string[];

  @ApiProperty({ example: 'joker#1234', required: false })
  @IsOptional()
  @IsString()
  discord?: string;

  @ApiProperty({ example: { tebex: 'tebex.io/joker' }, required: false })
  @IsOptional()
  portfolio_links?: Record<string, string>;

  @ApiProperty({
    example: 'https://cdn.modders-market.com/avatars/user123/avatar.png',
    required: false,
  })
  @IsOptional()
  @IsString()
  avatar_url?: string;

  @ApiProperty({
    example: 'dev',
    required: false,
    enum: ['client', 'dev'],
    description: 'Rol editable por el propio usuario. Admin sigue siendo manual.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['client', 'dev'])
  role?: 'client' | 'dev';
}
