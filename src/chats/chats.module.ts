import { Module } from '@nestjs/common';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  controllers: [ChatsController],
  providers: [ChatsService, SupabaseService, CloudflareR2Service],
})
export class ChatsModule {}
