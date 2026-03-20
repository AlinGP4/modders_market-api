// src/jobs/jobs.service.ts
import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateJobFormDto } from './dto/create-job-form.dto';
import { CreateJobFeedCommentDto } from './dto/create-job-feed-comment.dto';

export interface JobFilters {
  gameType?: string;
  taskType?: string;
}

const MAX_JOB_IMAGES = 6;
const MAX_JOB_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_JOB_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);
const JOB_IMAGE_MAX_DIMENSION_PX = 1600;

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
      .select(`
        *,
        client:users(name, avatar_url)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async findFeed(jobId: string) {
    const { data, error } = await this.supabase.client
      .from('job_feed_comments')
      .select(`
        id,
        job_id,
        content,
        created_at,
        author:users!job_feed_comments_author_id_fkey(id, name, avatar_url, role)
      `)
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
    const imageUrls = await this.processJobImages(clientSupabaseUserId, jobId, files ?? []);
    const coverImageIndex = this.resolveCoverImageIndex(jobDto.cover_image_index, imageUrls.length);
    const { cover_image_index, ...jobPayload } = jobDto;

    const job = {
      ...jobPayload,
      id: jobId,
      client_id: data.id,
      job_images: imageUrls,
      cover_image_url: coverImageIndex == null ? null : imageUrls[coverImageIndex],
    };

    const { data: newJob, error: insertError } = await this.supabase.client
      .from('jobs')
      .insert(job)
      .select()
      .single();

    if (insertError) throw insertError;
    return newJob;
  }

  async addFeedComment(jobId: string, viewerSupabaseId: string, dto: CreateJobFeedCommentDto) {
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
      throw new ForbiddenException('You must be authenticated to comment on the project feed.');
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
      throw new ForbiddenException('This project is no longer accepting public comments.');
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
          (file.originalname || 'job-image').replace(/\.[^/.]+$/, '') || 'job-image';

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
      throw new BadRequestException(`Solo puedes subir hasta ${MAX_JOB_IMAGES} imagenes por job.`);
    }

    for (const file of files) {
      if (!SUPPORTED_JOB_IMAGE_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          'Formato de imagen no soportado. Usa JPG, PNG, WEBP o AVIF.',
        );
      }

      if (file.size > MAX_JOB_IMAGE_SIZE_BYTES) {
        throw new BadRequestException('Cada imagen del job debe pesar menos de 8MB.');
      }

      if (!file.buffer?.length) {
        throw new BadRequestException('No se pudo leer una de las imagenes del job.');
      }
    }
  }

  private resolveCoverImageIndex(coverImageIndex: number | undefined, imageCount: number): number | null {
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
      throw new BadRequestException('La portada seleccionada no coincide con las imagenes enviadas.');
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
          quality: 82,
          effort: 5,
        })
        .toBuffer();
    } catch {
      throw new BadRequestException('No se pudo procesar una de las imagenes del job.');
    }
  }
}
