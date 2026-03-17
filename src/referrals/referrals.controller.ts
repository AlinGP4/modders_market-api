import { Body, Controller, Get, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ReferralsService } from './referrals.service';

@ApiTags('referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get or create my referral code' })
  async getMine(@Request() req: any) {
    return this.referralsService.getMine(req.user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update my referral code or regenerate it' })
  async updateMine(
    @Request() req: any,
    @Body() body: { code?: string | null; regenerate?: boolean },
  ) {
    return this.referralsService.updateMine(req.user.id, body ?? {});
  }

  @Get('me/dashboard')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get personal referral dashboard' })
  async getMyDashboard(@Request() req: any) {
    return this.referralsService.getMyDashboard(req.user.id);
  }

  @Get('admin/campaigns')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List admin-created campaign referral codes' })
  async listCampaigns(@Request() req: any) {
    return this.referralsService.listCampaigns(req.user.id);
  }

  @Post('admin/campaigns')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a custom campaign referral code' })
  async createCampaign(
    @Request() req: any,
    @Body() body: { code?: string | null; label?: string | null },
  ) {
    return this.referralsService.createCampaign(req.user.id, body ?? {});
  }

  @Get('admin/dashboard')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get admin referral dashboard' })
  async getAdminDashboard(@Request() req: any) {
    return this.referralsService.getAdminDashboard(req.user.id);
  }

  @Post('track-visit')
  @ApiOperation({ summary: 'Track first referral visit' })
  async trackVisit(
    @Request() req: ExpressRequest,
    @Body() body: { code?: string | null; visitor_key?: string | null; path?: string | null },
  ) {
    return this.referralsService.trackVisit(req, body ?? {});
  }

  @Post('track-login')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Track referral attribution on login/signup' })
  async trackLogin(
    @Request() req: any,
    @Body() body: { code?: string | null },
  ) {
    return this.referralsService.trackLogin(req as ExpressRequest, req.user.id, body ?? {});
  }
}
