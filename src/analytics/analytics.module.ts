import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SupabaseService } from '../supabase/supabase.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SupabaseService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
