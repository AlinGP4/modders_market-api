import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CreateJobDto } from './dto/create-job.dto';
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
  @ApiOperation({ summary: 'Jobs publicados por el cliente autenticado' })
  async findMine(@Request() req: any) {
    return this.jobsService.findPublishedByClient(req.user.id);
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
}
