// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobsModule } from './jobs/jobs.module';
import { UsersModule } from './users/users.module';
import { ProposalsModule } from './proposals/proposals.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JobsModule,
    UsersModule,
    ProposalsModule
  ],
})
export class AppModule {}
