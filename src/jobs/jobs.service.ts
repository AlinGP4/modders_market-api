// src/jobs/jobs.service.ts
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateJobFeedCommentDto } from './dto/create-job-feed-comment.dto';

export interface JobFilters {
  gameType?: string;
  taskType?: string;
}

@Injectable()
export class JobsService {
  constructor(private supabase: SupabaseService) {}

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

  async create(jobDto: any, clientId: string) {
    const { data, error } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('supabase_user_id', clientId)
      .single();

    if (error) throw error;

    const job = {
      ...jobDto,
      client_id: data.id
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
}
