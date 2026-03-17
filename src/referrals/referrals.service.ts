import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';

export interface ReferralLinkRecord {
  code: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignReferralRecord {
  id: string;
  code: string;
  label: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ReferralsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getMine(supabaseUserId: string): Promise<ReferralLinkRecord> {
    const user = await this.findUserBySupabaseId(supabaseUserId);

    const { data, error } = await this.supabase.client
      .from('referral_links')
      .select('code, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('kind', 'user')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }

    return this.createOrUpdateLink(user.id, await this.generateUniqueCode());
  }

  async updateMine(
    supabaseUserId: string,
    payload: { code?: string | null; regenerate?: boolean },
  ): Promise<ReferralLinkRecord> {
    const user = await this.findUserBySupabaseId(supabaseUserId);
    const { data: existing, error: existingError } = await this.supabase.client
      .from('referral_links')
      .select('code')
      .eq('user_id', user.id)
      .eq('kind', 'user')
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    const normalizedCode = this.normalizeCode(payload.code);
    if (!payload.regenerate && existing?.code && normalizedCode === existing.code) {
      return this.createOrUpdateLink(user.id, existing.code);
    }

    const nextCode =
      payload.regenerate || !payload.code?.trim()
        ? await this.generateUniqueCode()
        : await this.ensureCustomCodeAvailable(normalizedCode);

    return this.createOrUpdateLink(user.id, nextCode);
  }

  async listCampaigns(viewerSupabaseUserId: string): Promise<CampaignReferralRecord[]> {
    const admin = await this.assertAdmin(viewerSupabaseUserId);

    const { data, error } = await this.supabase.client
      .from('referral_links')
      .select('id, code, label, created_at, updated_at')
      .eq('kind', 'campaign')
      .eq('created_by_user_id', admin.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async createCampaign(
    viewerSupabaseUserId: string,
    payload: { code?: string | null; label?: string | null },
  ): Promise<CampaignReferralRecord> {
    const admin = await this.assertAdmin(viewerSupabaseUserId);
    const nextCode = payload.code?.trim()
      ? await this.ensureCustomCodeAvailable(this.normalizeCode(payload.code))
      : await this.generateUniqueCode('campaign');
    const nowIso = new Date().toISOString();

    const { data, error } = await this.supabase.client
      .from('referral_links')
      .insert({
        code: nextCode,
        kind: 'campaign',
        label: payload.label?.trim() || null,
        created_by_user_id: admin.id,
        updated_at: nowIso,
      })
      .select('id, code, label, created_at, updated_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new BadRequestException('Could not create campaign referral code.');
    }

    return data;
  }

  async trackVisit(
    request: Request,
    payload: { code?: string | null; visitor_key?: string | null; path?: string | null },
  ): Promise<{ tracked: boolean }> {
    const code = this.normalizeCode(payload.code);
    const visitorKey = payload.visitor_key?.trim();

    if (!code || !visitorKey) {
      throw new BadRequestException('Referral code and visitor key are required.');
    }

    const referral = await this.findReferralByCode(code);

    const { data: existing, error: existingError } = await this.supabase.client
      .from('referral_events')
      .select('id')
      .eq('referral_link_id', referral.id)
      .eq('event_type', 'visit')
      .eq('visitor_key', visitorKey)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      return { tracked: false };
    }

    const { error } = await this.supabase.client.from('referral_events').insert({
      referral_link_id: referral.id,
      referrer_user_id: referral.user_id ?? null,
      event_type: 'visit',
      visitor_key: visitorKey,
      ip_address: this.extractClientIp(request),
      path: this.normalizePath(payload.path),
    });

    if (error) {
      throw error;
    }

    return { tracked: true };
  }

  async trackLogin(
    request: Request,
    viewerSupabaseUserId: string,
    payload: { code?: string | null },
  ): Promise<{ tracked: boolean }> {
    const code = this.normalizeCode(payload.code);
    if (!code) {
      throw new BadRequestException('Referral code is required.');
    }

    const viewer = await this.findUserBySupabaseId(viewerSupabaseUserId);
    const referral = await this.findReferralByCode(code);

    if (referral.user_id && referral.user_id === viewer.id) {
      return { tracked: false };
    }

    const { data: existing, error: existingError } = await this.supabase.client
      .from('referral_events')
      .select('id')
      .eq('referral_link_id', referral.id)
      .eq('event_type', 'login')
      .eq('target_user_id', viewer.id)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      return { tracked: false };
    }

    const { error } = await this.supabase.client.from('referral_events').insert({
      referral_link_id: referral.id,
      referrer_user_id: referral.user_id ?? null,
      target_user_id: viewer.id,
      event_type: 'login',
      ip_address: this.extractClientIp(request),
    });

    if (error) {
      throw error;
    }

    return { tracked: true };
  }

  private async createOrUpdateLink(userId: string, code: string): Promise<ReferralLinkRecord> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase.client
      .from('referral_links')
      .upsert(
        {
          user_id: userId,
          code,
          kind: 'user',
          updated_at: nowIso,
        },
        { onConflict: 'user_id' },
      )
      .select('code, created_at, updated_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new BadRequestException('Could not save referral link.');
    }

    return data;
  }

  private async generateUniqueCode(prefix: 'user' | 'campaign' = 'user'): Promise<string> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const code = prefix === 'campaign' ? `camp-${randomBytes(4).toString('hex')}` : `mm-${randomBytes(4).toString('hex')}`;
      const { data, error } = await this.supabase.client
        .from('referral_links')
        .select('id')
        .eq('code', code)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return code;
      }
    }

    throw new BadRequestException('Could not generate a unique referral code.');
  }

  private async ensureCustomCodeAvailable(code: string): Promise<string> {
    if (!code) {
      throw new BadRequestException('Referral code is required.');
    }

    if (!/^[a-z0-9][a-z0-9-_]{2,31}$/i.test(code)) {
      throw new BadRequestException(
        'Referral code must be 3-32 characters and use only letters, numbers, dashes or underscores.',
      );
    }

    const { data, error } = await this.supabase.client
      .from('referral_links')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      throw new BadRequestException('Referral code is already in use.');
    }

    return code;
  }

  private async findUserBySupabaseId(supabaseUserId: string) {
    const { data, error } = await this.supabase.client
      .from('users')
      .select('id, role')
      .eq('supabase_user_id', supabaseUserId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new NotFoundException('Authenticated user profile not found.');
    }

    return data;
  }

  private async findReferralByCode(code: string) {
    const { data, error } = await this.supabase.client
      .from('referral_links')
      .select('id, user_id, kind, code')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new NotFoundException('Referral link not found.');
    }

    return data;
  }

  private normalizeCode(value?: string | null): string {
    return value?.trim().toLowerCase() ?? '';
  }

  private async assertAdmin(viewerSupabaseUserId: string) {
    const viewer = await this.findUserBySupabaseId(viewerSupabaseUserId);
    if (viewer.role !== 'admin') {
      throw new ForbiddenException('Only admins can manage campaign referral codes.');
    }

    return viewer;
  }

  private normalizePath(path?: string | null): string | null {
    const trimmed = path?.trim();
    return trimmed ? trimmed.slice(0, 500) : null;
  }

  private extractClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    const rawForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const candidate = rawForwarded?.split(',')[0]?.trim() || request.ip || 'unknown';
    return candidate.replace(/^::ffff:/, '').slice(0, 120);
  }
}
