// src/supabase/supabase.service.ts (con .env)
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get('SUPABASE_URL')!,
      this.configService.get('SUPABASE_ANON_KEY')!,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true
        }
      }
    );
  }

  get client() {
    return this.supabase;
  }
}
