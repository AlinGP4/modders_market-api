import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AnalyticsService, VisitSummary } from './analytics.service';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('visit')
  @ApiOperation({ summary: 'Track a unique site visitor by IP' })
  async trackVisit(
    @Request() req: ExpressRequest,
    @Body() body: { path?: string | null },
  ) {
    return this.analyticsService.trackVisit(req, body?.path);
  }

  @Get('summary')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get admin-only site visit summary' })
  async getSummary(@Request() req: any): Promise<VisitSummary> {
    return this.analyticsService.getSummary(req.user.id);
  }
}
