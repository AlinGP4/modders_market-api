import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateJobFeedCommentDto {
  @ApiProperty({ example: 'I can take this in two milestones and keep the first delivery lightweight.' })
  @IsNotEmpty()
  @IsString()
  content: string;
}
