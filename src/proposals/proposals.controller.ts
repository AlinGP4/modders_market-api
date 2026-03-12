// src/proposals/proposals.controller.ts
import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ProposalsService } from './proposals.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { AuthGuard } from '../auth/auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('proposals')
@Controller('proposals')
export class ProposalsController {
  constructor(private proposalsService: ProposalsService) {}

  @Post(':jobId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dev envía propuesta a job' })
  async create(@Param('jobId') jobId: string, @Body() dto: CreateProposalDto, @Request() req: any) {
    return this.proposalsService.create(jobId, dto, req.user.id);
  }

  @Get('job/:jobId')
  @ApiOperation({ summary: 'Propuestas de un job + chat' })
  async findByJob(@Param('jobId') jobId: string) {
    return this.proposalsService.findByJob(jobId);
  }

  @Patch(':proposalId/accept')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Client acepta propuesta' })
  async accept(@Param('proposalId') proposalId: string, @Request() req: any) {
    return this.proposalsService.acceptProposal(proposalId, req.user.id);
  }
}
