// src/users/users.service.ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';

@Injectable()
export class UsersService {
  constructor(private supabase: SupabaseService) {}

  async findDevs() {
    const { data, error } = await this.supabase.client
      .from('users')
      .select('id, name, bio, specialties, games, discord, rating_avg, jobs_completed')
      .eq('role', 'dev')
      .order('rating_avg', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  async findProfile(supabaseUserId: string) {
    const { data, error } = await this.supabase.client
      .from('users')
      .select('*')
      .eq('supabase_user_id', supabaseUserId)
      .maybeSingle();
    
    if (error) throw error;
    if (!data) {
      throw new NotFoundException(
        'No existe perfil para este usuario autenticado (users.supabase_user_id).',
      );
    }
    return data;
  }

  async updateProfile(supabaseUserId: string, dto: CreateUserProfileDto) {
    const { data: existingUser, error: findError } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('supabase_user_id', supabaseUserId)
      .maybeSingle();

    if (findError) throw findError;

    if (existingUser) {
      const { data, error } = await this.supabase.client
        .from('users')
        .update(dto)
        .eq('id', existingUser.id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new ForbiddenException(
          'No se pudo actualizar el perfil. Revisa RLS/policies de UPDATE/SELECT en users.',
        );
      }
      return data;
    }

    const payload = {
      supabase_user_id: supabaseUserId,
      ...dto,
    };

    const { data, error } = await this.supabase.client
      .from('users')
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new ForbiddenException(
        'No se pudo crear el perfil. Revisa RLS/policies de INSERT/SELECT en users.',
      );
    }
    return data;
  }
}
