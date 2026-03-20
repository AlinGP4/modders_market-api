// src/app.module.ts
import { Module } from '@nestjs/common';
import { ChatsModule } from './chats/chats.module';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from './analytics/analytics.module';
import { JobsModule } from './jobs/jobs.module';
import { ReferralsModule } from './referrals/referrals.module';
import { UsersModule } from './users/users.module';
import { ProposalsModule } from './proposals/proposals.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ChatsModule,
    AnalyticsModule,
    JobsModule,
    ReferralsModule,
    UsersModule,
    ProposalsModule,
  ],
})
export class AppModule {}
