// src/proposals/proposals.module.ts
import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { SupabaseService } from '../supabase/supabase.service';

@Module({
  controllers: [ProposalsController],
  providers: [ProposalsService, SupabaseService]
})
export class ProposalsModule {}
