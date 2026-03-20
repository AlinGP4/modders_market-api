// src/jobs/jobs.service.ts
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import sharp from 'sharp';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateJobFormDto } from './dto/create-job-form.dto';
import { CreateJobFeedCommentDto } from './dto/create-job-feed-comment.dto';

export interface JobFilters {
  gameType?: string;
  taskType?: string;
}

export interface AdminJobsSummary {
  totals: {
    total_jobs: number;
    jobs_created_today: number;
    open_jobs: number;
    active_jobs: number;
    completed_jobs: number;
    cancelled_jobs: number;
  };
  daily_created_jobs: Array<{
    date: string;
    count: number;
  }>;
  recent_jobs: Array<{
    id: string;
    title: string;
    status: string;
    game_type: string;
    task_type: string;
    created_at: string;
    cover_image_url: string | null;
    client: {
      name: string | null;
    } | null;
  }>;
  top_games: Array<{
    label: string;
    count: number;
  }>;
  top_task_types: Array<{
    label: string;
    count: number;
  }>;
}

const MAX_JOB_IMAGES = 6;
const MAX_JOB_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_JOB_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);
const JOB_IMAGE_MAX_DIMENSION_PX = 1200;
const JOB_IMAGE_WEBP_QUALITY = 74;

@Injectable()
export class JobsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly cloudflareR2: CloudflareR2Service,
  ) {}

  async findAll(filters: JobFilters) {
    let query = this.supabase.client
      .from('jobs')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (filters.gameType) query = query.eq('game_type', filters.gameType);
    if (filters.taskType) query = query.eq('task_type', filters.taskType);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async findOne(id: string) {
    const { data, error } = await this.supabase.client
      .from('jobs')
      .select(
        `
        *,
        client:users(name, avatar_url)
      `,
      )
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async findFeed(jobId: string) {
    const { data, error } = await this.supabase.client
      .from('job_feed_comments')
      .select(
        `
        id,
        job_id,
        content,
        created_at,
        author:users!job_feed_comments_author_id_fkey(id, name, avatar_url, role)
      `,
      )
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  }

  async findPublishedByUser(publisherSupabaseId: string) {
    const { data: user, error: userError } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('supabase_user_id', publisherSupabaseId)
      .maybeSingle();

    if (userError) throw userError;
    if (!user) {
      return [];
    }

    const { data, error } = await this.supabase.client
      .from('jobs')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getAdminSummary(
    viewerSupabaseUserId: string,
  ): Promise<AdminJobsSummary> {
    await this.assertAdmin(viewerSupabaseUserId);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const seriesStart = new Date();
    seriesStart.setHours(0, 0, 0, 0);
    seriesStart.setDate(seriesStart.getDate() - 13);

    const [jobsResponse, recentJobsResponse] = await Promise.all([
      this.supabase.client
        .from('jobs')
        .select('status, game_type, task_type, created_at'),
      this.supabase.client
        .from('jobs')
        .select(
          'id, title, status, game_type, task_type, created_at, cover_image_url, client:users(name)',
        )
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    if (jobsResponse.error) {
      throw jobsResponse.error;
    }

    if (recentJobsResponse.error) {
      throw recentJobsResponse.error;
    }

    const jobs = jobsResponse.data ?? [];
    const recentJobs = (recentJobsResponse.data ?? []).map((job) => ({
      ...job,
      client: Array.isArray(job.client)
        ? (job.client[0] ?? null)
        : (job.client ?? null),
    }));

    return {
      totals: {
        total_jobs: jobs.length,
        jobs_created_today: jobs.filter(
          (job) => new Date(job.created_at) >= startOfToday,
        ).length,
        open_jobs: jobs.filter((job) => job.status === 'open').length,
        active_jobs: jobs.filter((job) => job.status === 'assigned').length,
        completed_jobs: jobs.filter((job) => job.status === 'closed').length,
        cancelled_jobs: jobs.filter((job) => job.status === 'cancelled').length,
      },
      daily_created_jobs: this.buildDailyCreatedJobsSeries(seriesStart, jobs),
      recent_jobs: recentJobs,
      top_games: this.buildTopBuckets(jobs.map((job) => job.game_type)),
      top_task_types: this.buildTopBuckets(jobs.map((job) => job.task_type)),
    };
  }

  async create(
    jobDto: CreateJobFormDto,
    files: Express.Multer.File[] | undefined,
    clientSupabaseUserId: string,
  ) {
    const { data, error } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('supabase_user_id', clientSupabaseUserId)
      .single();

    if (error) throw error;

    const jobId = randomUUID();
    const imageUrls = await this.processJobImages(
      clientSupabaseUserId,
      jobId,
      files ?? [],
    );
    const coverImageIndex = this.resolveCoverImageIndex(
      jobDto.cover_image_index,
      imageUrls.length,
    );
    const { cover_image_index, ...jobPayload } = jobDto;

    const job = {
      ...jobPayload,
      id: jobId,
      client_id: data.id,
      job_images: imageUrls,
      cover_image_url:
        coverImageIndex == null ? null : imageUrls[coverImageIndex],
    };

    const { data: newJob, error: insertError } = await this.supabase.client
      .from('jobs')
      .insert(job)
      .select()
      .single();

    if (insertError) throw insertError;
    return newJob;
  }

  async addFeedComment(
    jobId: string,
    viewerSupabaseId: string,
    dto: CreateJobFeedCommentDto,
  ) {
    const content = dto.content?.trim();
    if (!content) {
      throw new BadRequestException('Comment content cannot be empty.');
    }

    const { data: viewer, error: viewerError } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('supabase_user_id', viewerSupabaseId)
      .maybeSingle();

    if (viewerError) throw viewerError;
    if (!viewer) {
      throw new ForbiddenException(
        'You must be authenticated to comment on the project feed.',
      );
    }

    const { data: job, error: jobError } = await this.supabase.client
      .from('jobs')
      .select('id, status')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError) throw jobError;
    if (!job) {
      throw new ForbiddenException('The project no longer exists.');
    }

    if (job.status === 'closed' || job.status === 'cancelled') {
      throw new ForbiddenException(
        'This project is no longer accepting public comments.',
      );
    }

    const { error: insertError } = await this.supabase.client
      .from('job_feed_comments')
      .insert({
        job_id: jobId,
        author_id: viewer.id,
        content,
      });

    if (insertError) throw insertError;
    return this.findFeed(jobId);
  }

  private async processJobImages(
    clientSupabaseUserId: string,
    jobId: string,
    files: Express.Multer.File[],
  ): Promise<string[]> {
    this.validateJobImages(files);

    return Promise.all(
      files.map(async (file) => {
        const optimizedBuffer = await this.optimizeJobImage(file.buffer);
        const originalBaseName =
          (file.originalname || 'job-image').replace(/\.[^/.]+$/, '') ||
          'job-image';

        return this.cloudflareR2.uploadJobImage({
          supabaseUserId: clientSupabaseUserId,
          jobId,
          originalName: `${originalBaseName}.webp`,
          mimeType: 'image/webp',
          fileBuffer: optimizedBuffer,
        });
      }),
    );
  }

  private validateJobImages(files: Express.Multer.File[]): void {
    if (files.length > MAX_JOB_IMAGES) {
      throw new BadRequestException(
        `Solo puedes subir hasta ${MAX_JOB_IMAGES} imagenes por job.`,
      );
    }

    for (const file of files) {
      if (!SUPPORTED_JOB_IMAGE_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          'Formato de imagen no soportado. Usa JPG, PNG, WEBP o AVIF.',
        );
      }

      if (file.size > MAX_JOB_IMAGE_SIZE_BYTES) {
        throw new BadRequestException(
          'Cada imagen del job debe pesar menos de 8MB.',
        );
      }

      if (!file.buffer?.length) {
        throw new BadRequestException(
          'No se pudo leer una de las imagenes del job.',
        );
      }
    }
  }

  private resolveCoverImageIndex(
    coverImageIndex: number | undefined,
    imageCount: number,
  ): number | null {
    if (imageCount === 0) {
      if (coverImageIndex != null) {
        throw new BadRequestException(
          'No puedes seleccionar una portada si no has subido imagenes para el job.',
        );
      }
      return null;
    }

    if (coverImageIndex == null) {
      return 0;
    }

    if (coverImageIndex < 0 || coverImageIndex >= imageCount) {
      throw new BadRequestException(
        'La portada seleccionada no coincide con las imagenes enviadas.',
      );
    }

    return coverImageIndex;
  }

  private async optimizeJobImage(fileBuffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(fileBuffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(JOB_IMAGE_MAX_DIMENSION_PX, JOB_IMAGE_MAX_DIMENSION_PX, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: JOB_IMAGE_WEBP_QUALITY,
          effort: 5,
        })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'No se pudo procesar una de las imagenes del job.',
      );
    }
  }

  private async assertAdmin(viewerSupabaseUserId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('users')
      .select('role')
      .eq('supabase_user_id', viewerSupabaseUserId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data || data.role !== 'admin') {
      throw new ForbiddenException('Only admins can view job analytics.');
    }
  }

  private buildDailyCreatedJobsSeries(
    startDate: Date,
    rows: Array<{ created_at: string }>,
  ): Array<{ date: string; count: number }> {
    const counts = new Map<string, number>();

    for (const row of rows) {
      const key = row.created_at.slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const days: Array<{ date: string; count: number }> = [];
    for (let offset = 0; offset < 14; offset += 1) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + offset);
      const key = current.toISOString().slice(0, 10);
      days.push({
        date: key,
        count: counts.get(key) ?? 0,
      });
    }

    return days;
  }

  private buildTopBuckets(
    values: Array<string | null | undefined>,
    limit = 4,
  ): Array<{ label: string; count: number }> {
    const buckets = new Map<string, { label: string; count: number }>();

    for (const value of values) {
      const normalized = value?.trim();
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }

      buckets.set(key, {
        label: this.formatBucketLabel(normalized),
        count: 1,
      });
    }

    return [...buckets.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, limit);
  }

  private formatBucketLabel(value: string): string {
    return value
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
