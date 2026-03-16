import { ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';

export interface VisitSummary {
  total_unique_visitors: number;
  new_visitors_today: number;
  active_visitors_last_24h: number;
  latest_visit: {
    path: string | null;
    seen_at: string | null;
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly supabase: SupabaseService) {}

  async trackVisit(request: Request, path?: string | null): Promise<{ tracked: true }> {
    const ipAddress = this.extractClientIp(request);
    const normalizedPath = this.normalizePath(path);
    const userAgent = this.normalizeUserAgent(request.headers['user-agent']);
    const nowIso = new Date().toISOString();

    const { data: existing, error: findError } = await this.supabase.client
      .from('site_visits')
      .select('id, total_hits')
      .eq('ip_address', ipAddress)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (existing) {
      const { error: updateError } = await this.supabase.client
        .from('site_visits')
        .update({
          last_seen_at: nowIso,
          last_path: normalizedPath,
          user_agent: userAgent,
          total_hits: (existing.total_hits ?? 0) + 1,
        })
        .eq('id', existing.id);

      if (updateError) {
        throw updateError;
      }

      return { tracked: true };
    }

    const { error: insertError } = await this.supabase.client.from('site_visits').insert({
      ip_address: ipAddress,
      first_path: normalizedPath,
      last_path: normalizedPath,
      user_agent: userAgent,
      total_hits: 1,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    });

    if (insertError) {
      throw insertError;
    }

    return { tracked: true };
  }

  async getSummary(viewerSupabaseUserId: string): Promise<VisitSummary> {
    await this.assertAdmin(viewerSupabaseUserId);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      { count: totalUnique, error: totalError },
      { count: todayUnique, error: todayError },
      { count: activeLast24h, error: activeError },
      latestResponse,
    ] = await Promise.all([
      this.supabase.client.from('site_visits').select('*', { head: true, count: 'exact' }),
      this.supabase.client
        .from('site_visits')
        .select('*', { head: true, count: 'exact' })
        .gte('first_seen_at', startOfToday.toISOString()),
      this.supabase.client
        .from('site_visits')
        .select('*', { head: true, count: 'exact' })
        .gte('last_seen_at', last24Hours.toISOString()),
      this.supabase.client
        .from('site_visits')
        .select('last_path, last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (totalError) {
      throw totalError;
    }

    if (todayError) {
      throw todayError;
    }

    if (activeError) {
      throw activeError;
    }

    if (latestResponse.error) {
      throw latestResponse.error;
    }

    return {
      total_unique_visitors: totalUnique ?? 0,
      new_visitors_today: todayUnique ?? 0,
      active_visitors_last_24h: activeLast24h ?? 0,
      latest_visit: {
        path: latestResponse.data?.last_path ?? null,
        seen_at: latestResponse.data?.last_seen_at ?? null,
      },
    };
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
      throw new ForbiddenException('Only admins can view analytics.');
    }
  }

  private extractClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    const rawForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const candidate = rawForwarded?.split(',')[0]?.trim() || request.ip || 'unknown';
    return candidate.replace(/^::ffff:/, '').slice(0, 120);
  }

  private normalizePath(path?: string | null): string | null {
    const trimmed = path?.trim();
    return trimmed ? trimmed.slice(0, 500) : null;
  }

  private normalizeUserAgent(userAgent: string | string[] | undefined): string | null {
    const value = Array.isArray(userAgent) ? userAgent[0] : userAgent;
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, 500) : null;
  }
}
