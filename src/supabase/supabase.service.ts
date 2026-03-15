// src/supabase/supabase.service.ts (con .env)
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const { url, anonKey } = this.resolveConfig();

    this.supabase = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }

  get client() {
    return this.supabase;
  }

  private resolveConfig(): { url: string; anonKey: string } {
    const explicitTarget = (this.configService.get<string>('SUPABASE_TARGET') ?? '').trim().toLowerCase();
    const nodeEnv = (this.configService.get<string>('NODE_ENV') ?? '').trim().toLowerCase();
    const target = explicitTarget === 'pre' || explicitTarget === 'pro' ? explicitTarget : nodeEnv === 'production' ? 'pro' : 'pre';

    const url =
      target === 'pro'
        ? this.configService.get<string>('SUPABASE_URL_PRO')
        : this.configService.get<string>('SUPABASE_URL_PRE');
    const anonKey =
      target === 'pro'
        ? this.configService.get<string>('SUPABASE_ANON_KEY_PRO')
        : this.configService.get<string>('SUPABASE_ANON_KEY_PRE');

    return {
      url: url ?? this.configService.get<string>('SUPABASE_URL') ?? '',
      anonKey: anonKey ?? this.configService.get<string>('SUPABASE_ANON_KEY') ?? '',
    };
  }
}
