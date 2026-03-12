// src/jobs/jobs.service.ts
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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
        client:users(name, avatar_url),
        proposals (
          *,
          dev:users(name, avatar_url, specialties, rating_avg)
        )
      `)
      .eq('id', id)
      .single();
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
}
