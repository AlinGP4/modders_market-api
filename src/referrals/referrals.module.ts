import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { SupabaseService } from '../supabase/supabase.service';

@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService, SupabaseService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
