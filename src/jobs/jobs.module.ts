// src/jobs/jobs.module.ts
import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { SupabaseService } from '../supabase/supabase.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, SupabaseService],
  exports: [JobsService]
})
export class JobsModule {}
