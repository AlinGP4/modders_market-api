// src/jobs/jobs.module.ts
import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, SupabaseService, CloudflareR2Service],
  exports: [JobsService]
})
export class JobsModule {}
