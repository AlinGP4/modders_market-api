// src/users/users.service.ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class UsersService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly cloudflareR2: CloudflareR2Service,
  ) {}

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

  async uploadAvatar(supabaseUserId: string, file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('No se recibio archivo. Usa el campo multipart "file".');
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('El avatar debe ser una imagen.');
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      throw new BadRequestException('El avatar supera 5MB.');
    }

    if (!file.buffer?.length) {
      throw new BadRequestException('No se pudo leer el archivo del avatar.');
    }

    const { data: existingUser, error: findError } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('supabase_user_id', supabaseUserId)
      .maybeSingle();

    if (findError) throw findError;

    if (!existingUser) {
      throw new NotFoundException(
        'No existe perfil para este usuario autenticado. Crea el perfil antes de subir avatar.',
      );
    }

    const avatarUrl = await this.cloudflareR2.uploadAvatar({
      supabaseUserId,
      originalName: file.originalname || 'avatar',
      mimeType: file.mimetype,
      fileBuffer: file.buffer,
    });

    const { data, error } = await this.supabase.client
      .from('users')
      .update({ avatar_url: avatarUrl })
      .eq('id', existingUser.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new ForbiddenException(
        'No se pudo actualizar avatar_url. Revisa RLS/policies de UPDATE/SELECT en users.',
      );
    }

    return data;
  }
}
