// src/proposals/proposals.controller.ts
import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ProposalsService } from './proposals.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { CreateProposalMessageDto } from './dto/create-proposal-message.dto';
import { UpdateProposalStatusDto } from './dto/update-proposal-status.dto';
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
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Propuestas de un job + chat' })
  async findByJob(@Param('jobId') jobId: string, @Request() req: any) {
    return this.proposalsService.findByJob(jobId, req.user.id);
  }

  @Get('job/:jobId/mine')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Propuesta del dev autenticado para un job' })
  async findMineByJob(@Param('jobId') jobId: string, @Request() req: any) {
    return this.proposalsService.findMineByJob(jobId, req.user.id);
  }

  @Get(':proposalId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalle de una propuesta concreta' })
  async findOne(@Param('proposalId') proposalId: string, @Request() req: any) {
    return this.proposalsService.findOne(proposalId, req.user.id);
  }

  @Patch(':proposalId/accept')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Client acepta propuesta' })
  async accept(@Param('proposalId') proposalId: string, @Request() req: any) {
    return this.proposalsService.acceptProposal(proposalId, req.user.id);
  }

  @Patch(':proposalId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar propuesta propia' })
  async update(@Param('proposalId') proposalId: string, @Body() dto: UpdateProposalDto, @Request() req: any) {
    return this.proposalsService.updateProposal(proposalId, dto, req.user.id);
  }

  @Patch(':proposalId/status')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar estado de una propuesta' })
  async updateStatus(@Param('proposalId') proposalId: string, @Body() dto: UpdateProposalStatusDto, @Request() req: any) {
    return this.proposalsService.updateProposalStatus(proposalId, dto.status, req.user.id);
  }

  @Post(':proposalId/messages')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enviar mensaje dentro del hilo de propuesta' })
  async addMessage(@Param('proposalId') proposalId: string, @Body() dto: CreateProposalMessageDto, @Request() req: any) {
    return this.proposalsService.addMessage(proposalId, dto, req.user.id);
  }
}
