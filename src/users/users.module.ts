// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CloudflareR2Service } from '../storage/cloudflare-r2.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, SupabaseService, CloudflareR2Service],
  exports: [UsersService]
})
export class UsersModule {}
