// src/proposals/proposals.service.ts
import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProposalDto } from './dto/create-proposal.dto';

type AcceptProposalMode = 'rpc' | 'direct' | 'auto';

@Injectable()
export class ProposalsService {
    constructor(
        private readonly supabase: SupabaseService,
        private readonly configService: ConfigService,
    ) { }

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
        const mode = this.resolveAcceptMode();

        if (mode === 'direct') {
            return this.acceptProposalDirect(proposalId, clientSupabaseId);
        }

        const { data, error } = await this.supabase.client.rpc('accept_proposal_rpc', {
            prop_id: proposalId,
            client_supabase_id: clientSupabaseId,
        });

        if (!error) {
            return data;
        }

        if (mode === 'auto' && this.shouldFallbackToDirect(error.message)) {
            return this.acceptProposalDirect(proposalId, clientSupabaseId);
        }

        throw new ForbiddenException(error.message);
    }

    private resolveAcceptMode(): AcceptProposalMode {
        const nodeEnv = (this.configService.get<string>('NODE_ENV') ?? '').toLowerCase();
        const rawMode = (this.configService.get<string>('ACCEPT_PROPOSAL_MODE') ?? '').toLowerCase();

        if (rawMode === 'rpc' || rawMode === 'direct') {
            return rawMode;
        }

        if (rawMode === 'auto') {
            return nodeEnv === 'production' ? 'direct' : 'auto';
        }

        return nodeEnv === 'production' ? 'direct' : 'rpc';
    }

    private shouldFallbackToDirect(message: string): boolean {
        const lower = (message || '').toLowerCase();
        return (
            lower.includes('localhost:3000') ||
            lower.includes('failed to send') ||
            lower.includes('fetch failed') ||
            lower.includes('connection refused')
        );
    }

    private async acceptProposalDirect(proposalId: string, clientSupabaseId: string) {
        const { data: client, error: clientError } = await this.supabase.client
            .from('users')
            .select('id, role')
            .eq('supabase_user_id', clientSupabaseId)
            .maybeSingle();

        if (clientError) throw clientError;
        if (!client || client.role !== 'client') {
            throw new ForbiddenException('Solo el cliente propietario puede aceptar propuestas.');
        }

        const { data: proposal, error: proposalError } = await this.supabase.client
            .from('proposals')
            .select('id, job_id, status')
            .eq('id', proposalId)
            .maybeSingle();

        if (proposalError) throw proposalError;
        if (!proposal) {
            throw new ForbiddenException('La propuesta no existe.');
        }

        const { data: job, error: jobError } = await this.supabase.client
            .from('jobs')
            .select('id, client_id, status')
            .eq('id', proposal.job_id)
            .maybeSingle();

        if (jobError) throw jobError;
        if (!job) {
            throw new ForbiddenException('El job asociado a la propuesta no existe.');
        }

        if (job.client_id !== client.id) {
            throw new ForbiddenException('Solo el cliente propietario puede aceptar propuestas.');
        }

        if (job.status !== 'open') {
            throw new ForbiddenException(`El job no esta abierto (status actual: ${job.status}).`);
        }

        const { error: acceptError } = await this.supabase.client
            .from('proposals')
            .update({ status: 'accepted' })
            .eq('id', proposal.id);

        if (acceptError) throw acceptError;

        const { error: rejectError } = await this.supabase.client
            .from('proposals')
            .update({ status: 'rejected' })
            .eq('job_id', proposal.job_id)
            .neq('id', proposal.id);

        if (rejectError) throw rejectError;

        const { error: jobUpdateError } = await this.supabase.client
            .from('jobs')
            .update({ status: 'in_progress' })
            .eq('id', proposal.job_id);

        if (jobUpdateError) throw jobUpdateError;

        return {
            ok: true,
            mode: 'direct',
            proposal_id: proposal.id,
            job_id: proposal.job_id,
            job_status: 'in_progress',
        };
    }
}
