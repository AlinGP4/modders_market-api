import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdateProposalStatusDto {
  @ApiProperty({
    example: 'in_progress',
    enum: ['pending', 'accepted', 'rejected', 'in_progress', 'completed', 'cancel_requested_owner', 'cancel_requested_dev', 'cancelled'],
  })
  @IsString()
  @IsIn(['pending', 'accepted', 'rejected', 'in_progress', 'completed', 'cancel_requested_owner', 'cancel_requested_dev', 'cancelled'])
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'cancel_requested_owner' | 'cancel_requested_dev' | 'cancelled';
}
