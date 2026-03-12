import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, Min, IsUUID } from 'class-validator';

export class CreateProposalDto {
  @ApiProperty({ example: 'Puedo hacerlo por 85€ en 4 días' })
  @IsNotEmpty()
  @IsString()
  message: string;

  @ApiProperty({ example: 85, description: 'Precio ofrecido €' })
  @IsNumber()
  @Min(10)
  proposed_price: number;

  @ApiProperty({ example: 4, description: 'Días estimados' })
  @IsNumber()
  @Min(1)
  proposed_days: number;
}
