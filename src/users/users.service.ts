// src/users/users.service.ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateUserProfileDto } from './dto/create-user-profile.dto';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const AVATAR_SIZE_PX = 512;

@Injectable()
export class UsersService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly cloudflareR2: CloudflareR2Service,
  ) {}

  async findPublicProfiles() {
    const { data, error } = await this.supabase.client
      .from('users')
      .select(
        'id, role, name, bio, specialties, games, discord, avatar_url, rating_avg, jobs_completed',
      )
      .neq('role', 'admin')
      .order('rating_avg', { ascending: false, nullsFirst: false })
      .order('jobs_completed', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  }

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
      .select('id, role')
      .eq('supabase_user_id', supabaseUserId)
      .maybeSingle();

    if (findError) throw findError;

    const payload: CreateUserProfileDto = { ...dto };
    if (existingUser?.role === 'admin') {
      delete payload.role;
    }

    if (existingUser) {
      const { data, error } = await this.supabase.client
        .from('users')
        .update(payload)
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

    const insertPayload = {
      supabase_user_id: supabaseUserId,
      ...payload,
    };

    const { data, error } = await this.supabase.client
      .from('users')
      .insert(insertPayload)
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

    if (!SUPPORTED_AVATAR_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Formato de avatar no soportado. Usa JPG, PNG, WEBP o AVIF.',
      );
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

    const optimizedAvatarBuffer = await this.optimizeAvatar(file.buffer);
    const originalBaseName = (file.originalname || 'avatar').replace(/\.[^/.]+$/, '') || 'avatar';
    const optimizedOriginalName = `${originalBaseName}.webp`;

    const avatarUrl = await this.cloudflareR2.uploadAvatar({
      supabaseUserId,
      originalName: optimizedOriginalName,
      mimeType: 'image/webp',
      fileBuffer: optimizedAvatarBuffer,
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

  private async optimizeAvatar(fileBuffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(fileBuffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, {
          fit: 'cover',
          position: 'centre',
        })
        .webp({
          quality: 82,
          effort: 5,
        })
        .toBuffer();
    } catch {
      throw new BadRequestException('No se pudo procesar la imagen del avatar.');
    }
  }
}
