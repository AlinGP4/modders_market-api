// src/proposals/proposals.service.ts (SIN JobsService)
import { Injectable, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProposalDto } from './dto/create-proposal.dto';

@Injectable()
export class ProposalsService {
    constructor(private supabase: SupabaseService) { }

    async create(jobId: string, dto: CreateProposalDto, devSupabaseId: string) {
        // Check job open
        const { data: job } = await this.supabase.client
            .from('jobs')
            .select('status')
            .eq('id', jobId)
            .single();

        if (!job || job.status !== 'open') {
            throw new ForbiddenException('Job cerrado o no existe');
        }

        // Get dev_id
        const { data: dev } = await this.supabase.client
            .from('users')
            .select('id, role')
            .eq('supabase_user_id', devSupabaseId)
            .single();

        if (!dev || dev.role !== 'dev') {
            throw new ForbiddenException('Solo devs pueden proponer');
        }

        const proposal = {
            job_id: jobId,
            dev_id: dev.id,
            ...dto
        };

        const { data, error } = await this.supabase.client
            .from('proposals')
            .insert(proposal)
            .select(`
        *,
        dev:users(name, avatar_url, specialties, rating_avg, discord)
      `)
            .single();

        if (error) throw error;
        return data;
    }

    async findByJob(jobId: string) {
        const { data, error } = await this.supabase.client
            .from('proposals')
            .select(`
        *,
        dev:users(name, avatar_url, specialties, rating_avg),
        messages (
          *,
          sender:users(name)
        )
      `)
            .eq('job_id', jobId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    async acceptProposal(proposalId: string, clientSupabaseId: string) {
        // Single query verifica todo
        const { data, error } = await this.supabase.client
            .rpc('accept_proposal_rpc', {
                prop_id: proposalId,
                client_supabase_id: clientSupabaseId
            });

        if (error) throw new ForbiddenException(error.message);
        return data;
    }
}
