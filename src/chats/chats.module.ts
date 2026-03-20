import { Module } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  controllers: [ChatsController],
  providers: [ChatsService, SupabaseService],
})
export class ChatsModule {}
