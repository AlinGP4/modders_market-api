// src/jobs/jobs.controller.ts (versión FINAL)
import { Controller, Get, Post, Patch, Body, Query, Param, UseGuards, ExecutionContext, Request } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { AuthGuard } from '../auth/auth.guard';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { CreateJobDto } from './dto/create-job.dto';

class JobDto {
    title: string;
    description: string;
    game_type: string;
    task_type: string;
    budget_min?: number;
    budget_max?: number;
    duration_days?: number;
}

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
    constructor(private jobsService: JobsService) { }

    @Get()
    @ApiOperation({ summary: 'Listar jobs abiertos + filtros' })
    @ApiQuery({ name: 'game_type', enum: ['fivem', 'minecraft'] })
    @ApiQuery({ name: 'task_type', enum: ['script', 'plugin', 'mlo', 'car', 'ui'] })
    async findAll(@Query('game_type') gameType?: string, @Query('task_type') taskType?: string) {
        return this.jobsService.findAll({ gameType, taskType });
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
