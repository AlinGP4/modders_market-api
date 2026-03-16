import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProposalMessageDto {
  @ApiProperty({ example: 'I can adjust the milestone split if needed.' })
  @IsNotEmpty()
  @IsString()
  content: string;
}
