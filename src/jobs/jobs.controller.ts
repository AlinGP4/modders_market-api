import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CreateJobFeedCommentDto } from './dto/create-job-feed-comment.dto';
import { CreateJobFormDto } from './dto/create-job-form.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar jobs abiertos + filtros' })
  @ApiQuery({ name: 'game_type', enum: ['fivem', 'minecraft'] })
  @ApiQuery({
    name: 'task_type',
    enum: ['script', 'plugin', 'mlo', 'car', 'ui'],
  })
  async findAll(
    @Query('game_type') gameType?: string,
    @Query('task_type') taskType?: string,
  ) {
    return this.jobsService.findAll({ gameType, taskType });
  }

  @Get('me/published')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Jobs publicados por el usuario autenticado' })
  async findMine(@Request() req: any) {
    return this.jobsService.findPublishedByUser(req.user.id);
  }

  @Get('admin/summary')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resumen admin de jobs y actividad reciente' })
  async getAdminSummary(@Request() req: any) {
    return this.jobsService.getAdminSummary(req.user.id);
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
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Crear nuevo job (solo clients)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        game_type: { type: 'string' },
        task_type: { type: 'string' },
        budget_min: { type: 'number' },
        budget_max: { type: 'number' },
        duration_days: { type: 'number' },
        cover_image_index: { type: 'number' },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['title', 'game_type', 'task_type'],
    },
  })
  @UseInterceptors(FilesInterceptor('images', 6))
  async create(
    @Body() createJobDto: CreateJobFormDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Request() req: any,
  ) {
    return this.jobsService.create(createJobDto, files, req.user.id);
  }

  @Post(':id/feed/comments')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publicar comentario publico en el feed del job' })
  async addFeedComment(
    @Param('id') id: string,
    @Body() dto: CreateJobFeedCommentDto,
    @Request() req: any,
  ) {
    return this.jobsService.addFeedComment(id, req.user.id, dto);
  }
}
