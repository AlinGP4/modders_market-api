import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CreateJobDto } from './dto/create-job.dto';
import { CreateJobFeedCommentDto } from './dto/create-job-feed-comment.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar jobs abiertos + filtros' })
  @ApiQuery({ name: 'game_type', enum: ['fivem', 'minecraft'] })
  @ApiQuery({ name: 'task_type', enum: ['script', 'plugin', 'mlo', 'car', 'ui'] })
  async findAll(@Query('game_type') gameType?: string, @Query('task_type') taskType?: string) {
    return this.jobsService.findAll({ gameType, taskType });
  }

  @Get('me/published')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Jobs publicados por el usuario autenticado' })
  async findMine(@Request() req: any) {
    return this.jobsService.findPublishedByUser(req.user.id);
  }

  @Get(':id/feed')
  @ApiOperation({ summary: 'Comentarios publicos del feed del job' })
  async findFeed(@Param('id') id: string) {
    return this.jobsService.findFeed(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear nuevo job (solo clients)' })
  async create(@Body() createJobDto: CreateJobDto, @Request() req: any) {
    return this.jobsService.create(createJobDto, req.user.id);
  }

  @Post(':id/feed/comments')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publicar comentario publico en el feed del job' })
  async addFeedComment(@Param('id') id: string, @Body() dto: CreateJobFeedCommentDto, @Request() req: any) {
    return this.jobsService.addFeedComment(id, req.user.id, dto);
  }
}
