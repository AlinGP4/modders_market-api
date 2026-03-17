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

export interface ReferralStatsRecord {
  visits: number;
  attributed_users: number;
  conversion_rate: number;
  latest_visit_at: string | null;
  latest_attributed_user_at: string | null;
}

export interface ReferralRecentEventRecord {
  id: string;
  event_type: 'visit' | 'login';
  created_at: string;
  path: string | null;
  ip_address: string;
  target_user: {
    id: string;
    name: string;
  } | null;
}

export interface MyReferralDashboardRecord {
  link: ReferralLinkRecord;
  stats: ReferralStatsRecord;
  recent_events: ReferralRecentEventRecord[];
}

export interface ReferralLeaderboardEntryRecord {
  user_id: string;
  name: string;
  role: 'client' | 'dev' | 'admin';
  code: string;
  visits: number;
  attributed_users: number;
  conversion_rate: number;
}

export interface CampaignReferralDashboardRecord extends CampaignReferralRecord {
  visits: number;
  attributed_users: number;
  conversion_rate: number;
}

export interface AdminReferralDashboardRecord {
  totals: {
    visits: number;
    attributed_users: number;
    conversion_rate: number;
    user_links: number;
    campaign_links: number;
  };
  top_referrers: ReferralLeaderboardEntryRecord[];
  campaigns: CampaignReferralDashboardRecord[];
}

interface ReferralLinkRow {
  id: string;
  user_id: string | null;
  code: string;
  kind: 'user' | 'campaign';
  label: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ReferralEventRow {
  id: string;
  referral_link_id: string;
  target_user_id: string | null;
  event_type: 'visit' | 'login';
  path: string | null;
  ip_address: string;
  created_at: string;
}

interface ReferralEventTargetUserRow {
  id: string;
  name: string;
}

@Injectable()
export class ReferralsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getMine(supabaseUserId: string): Promise<ReferralLinkRecord> {
    const user = await this.findUserBySupabaseId(supabaseUserId);
    const link = await this.getOrCreateUserReferralRow(user.id);
    return this.mapReferralLinkRecord(link);
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
      const link = await this.saveUserLink(user.id, existing.code);
      return this.mapReferralLinkRecord(link);
    }

    const nextCode =
      payload.regenerate || !payload.code?.trim()
        ? await this.generateUniqueCode()
        : await this.ensureCustomCodeAvailable(normalizedCode);

    const link = await this.saveUserLink(user.id, nextCode);
    return this.mapReferralLinkRecord(link);
  }

  async getMyDashboard(supabaseUserId: string): Promise<MyReferralDashboardRecord> {
    const user = await this.findUserBySupabaseId(supabaseUserId);
    const link = await this.getOrCreateUserReferralRow(user.id);
    const events = await this.listEventsByReferralLinkIds([link.id], 12);
    const targetUsers = await this.listTargetUsers(events);

    return {
      link: this.mapReferralLinkRecord(link),
      stats: this.buildStats(events),
      recent_events: events.map((event) => ({
        id: event.id,
        event_type: event.event_type,
        created_at: event.created_at,
        path: event.path,
        ip_address: event.ip_address,
        target_user: event.target_user_id ? targetUsers.get(event.target_user_id) ?? null : null,
      })),
    };
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

  async getAdminDashboard(viewerSupabaseUserId: string): Promise<AdminReferralDashboardRecord> {
    await this.assertAdmin(viewerSupabaseUserId);

    const links = await this.listAllReferralLinks();
    const events = await this.listEventsByReferralLinkIds(
      links.map((link) => link.id),
      0,
    );
    const users = await this.listAllUsersBasic();
    const userMap = new Map(users.map((user) => [user.id, user]));
    const statsByLinkId = this.buildStatsByLink(events);

    const userLinks = links.filter((link) => link.kind === 'user' && !!link.user_id);
    const campaignLinks = links.filter((link) => link.kind === 'campaign');

    const topReferrers = userLinks
      .map((link) => {
        const stats = statsByLinkId.get(link.id) ?? this.emptyStats();
        const owner = link.user_id ? userMap.get(link.user_id) : null;
        if (!owner) {
          return null;
        }

        return {
          user_id: owner.id,
          name: owner.name,
          role: owner.role,
          code: link.code,
          visits: stats.visits,
          attributed_users: stats.attributed_users,
          conversion_rate: stats.conversion_rate,
        } satisfies ReferralLeaderboardEntryRecord;
      })
      .filter((entry): entry is ReferralLeaderboardEntryRecord => !!entry)
      .sort((a, b) => {
        if (b.attributed_users !== a.attributed_users) {
          return b.attributed_users - a.attributed_users;
        }
        if (b.visits !== a.visits) {
          return b.visits - a.visits;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);

    const campaigns = campaignLinks
      .map((link) => {
        const stats = statsByLinkId.get(link.id) ?? this.emptyStats();
        return {
          id: link.id,
          code: link.code,
          label: link.label,
          created_at: link.created_at,
          updated_at: link.updated_at,
          visits: stats.visits,
          attributed_users: stats.attributed_users,
          conversion_rate: stats.conversion_rate,
        } satisfies CampaignReferralDashboardRecord;
      })
      .sort((a, b) => {
        if (b.attributed_users !== a.attributed_users) {
          return b.attributed_users - a.attributed_users;
        }
        if (b.visits !== a.visits) {
          return b.visits - a.visits;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    const totals = this.buildStats(events);

    return {
      totals: {
        visits: totals.visits,
        attributed_users: totals.attributed_users,
        conversion_rate: totals.conversion_rate,
        user_links: userLinks.length,
        campaign_links: campaignLinks.length,
      },
      top_referrers: topReferrers,
      campaigns,
    };
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

  private async getOrCreateUserReferralRow(userId: string): Promise<ReferralLinkRow> {
    const { data, error } = await this.supabase.client
      .from('referral_links')
      .select('id, user_id, code, kind, label, created_by_user_id, created_at, updated_at')
      .eq('user_id', userId)
      .eq('kind', 'user')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }

    return this.saveUserLink(userId, await this.generateUniqueCode());
  }

  private async saveUserLink(userId: string, code: string): Promise<ReferralLinkRow> {
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
      .select('id, user_id, code, kind, label, created_by_user_id, created_at, updated_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new BadRequestException('Could not save referral link.');
    }

    return data;
  }

  private mapReferralLinkRecord(link: ReferralLinkRow): ReferralLinkRecord {
    return {
      code: link.code,
      created_at: link.created_at,
      updated_at: link.updated_at,
    };
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

  private async listAllReferralLinks(): Promise<ReferralLinkRow[]> {
    const { data, error } = await this.supabase.client
      .from('referral_links')
      .select('id, user_id, code, kind, label, created_by_user_id, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  private async listEventsByReferralLinkIds(
    referralLinkIds: string[],
    limit = 0,
  ): Promise<ReferralEventRow[]> {
    if (!referralLinkIds.length) {
      return [];
    }

    let query = this.supabase.client
      .from('referral_events')
      .select('id, referral_link_id, target_user_id, event_type, path, ip_address, created_at')
      .in('referral_link_id', referralLinkIds)
      .order('created_at', { ascending: false });

    if (limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  private async listTargetUsers(events: ReferralEventRow[]): Promise<Map<string, ReferralEventTargetUserRow>> {
    const ids = [...new Set(events.map((event) => event.target_user_id).filter((value): value is string => !!value))];
    if (!ids.length) {
      return new Map();
    }

    const { data, error } = await this.supabase.client.from('users').select('id, name').in('id', ids);

    if (error) {
      throw error;
    }

    return new Map((data ?? []).map((user) => [user.id, user]));
  }

  private async listAllUsersBasic(): Promise<Array<{ id: string; name: string; role: 'client' | 'dev' | 'admin' }>> {
    const { data, error } = await this.supabase.client.from('users').select('id, name, role');

    if (error) {
      throw error;
    }

    return (data ?? []) as Array<{ id: string; name: string; role: 'client' | 'dev' | 'admin' }>;
  }

  private buildStats(events: ReferralEventRow[]): ReferralStatsRecord {
    const visits = events.filter((event) => event.event_type === 'visit').length;
    const attributedUsers = new Set(
      events.filter((event) => event.event_type === 'login').map((event) => event.target_user_id).filter(Boolean),
    ).size;
    const latestVisit = events.find((event) => event.event_type === 'visit')?.created_at ?? null;
    const latestAttributedUser = events.find((event) => event.event_type === 'login')?.created_at ?? null;

    return {
      visits,
      attributed_users: attributedUsers,
      conversion_rate: this.calculateConversionRate(visits, attributedUsers),
      latest_visit_at: latestVisit,
      latest_attributed_user_at: latestAttributedUser,
    };
  }

  private buildStatsByLink(events: ReferralEventRow[]): Map<string, ReferralStatsRecord> {
    const grouped = new Map<string, ReferralEventRow[]>();

    events.forEach((event) => {
      const bucket = grouped.get(event.referral_link_id) ?? [];
      bucket.push(event);
      grouped.set(event.referral_link_id, bucket);
    });

    return new Map(
      [...grouped.entries()].map(([linkId, bucket]) => [linkId, this.buildStats(bucket)]),
    );
  }

  private emptyStats(): ReferralStatsRecord {
    return {
      visits: 0,
      attributed_users: 0,
      conversion_rate: 0,
      latest_visit_at: null,
      latest_attributed_user_at: null,
    };
  }

  private calculateConversionRate(visits: number, attributedUsers: number): number {
    if (!visits || !attributedUsers) {
      return 0;
    }

    return Math.round((attributedUsers / visits) * 1000) / 10;
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
