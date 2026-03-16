// src/proposals/proposals.service.ts
import { Injectable, ForbiddenException, BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { CreateProposalMessageDto } from './dto/create-proposal-message.dto';

type AcceptProposalMode = 'rpc' | 'direct' | 'auto';
type ProposalStatus =
    | 'pending'
    | 'accepted'
    | 'rejected'
    | 'in_progress'
    | 'completed'
    | 'cancel_requested_owner'
    | 'cancel_requested_dev'
    | 'cancelled';

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
            .select('status, client_id')
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

        if (!dev || (dev.role !== 'dev' && dev.role !== 'admin')) {
            throw new ForbiddenException('Solo developers o admins pueden proponer');
        }

        if (job.client_id === dev.id) {
            throw new ForbiddenException('No puedes enviar una propuesta a tu propio job.');
        }

        const { data: latestProposal, error: latestProposalError } = await this.supabase.client
            .from('proposals')
            .select('id, status, created_at')
            .eq('job_id', jobId)
            .eq('dev_id', dev.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (latestProposalError) throw latestProposalError;
        if (latestProposal && !this.canCreateReplacementProposal(latestProposal.status)) {
            throw new ConflictException(this.buildNewProposalConflictMessage(latestProposal.status));
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

    async findMineByJob(jobId: string, viewerSupabaseId: string) {
        const { data: viewer, error: viewerError } = await this.supabase.client
            .from('users')
            .select('id, role')
            .eq('supabase_user_id', viewerSupabaseId)
            .maybeSingle();

        if (viewerError) throw viewerError;
        if (!viewer) {
            throw new ForbiddenException('You must be authenticated to view your proposal.');
        }

        if (viewer.role !== 'dev' && viewer.role !== 'admin') {
            return null;
        }

        return this.getProposalThreadByJobAndDev(jobId, viewer.id);
    }

    async findOne(proposalId: string, viewerSupabaseId: string) {
        const { viewer, proposal, job } = await this.resolveProposalParticipants(proposalId, viewerSupabaseId);

        const isProposalDev = proposal.dev_id === viewer.id;
        const isJobOwner = job.client_id === viewer.id;
        if (!isProposalDev && !isJobOwner) {
            throw new ForbiddenException('Only proposal participants can view this thread.');
        }

        return this.getProposalThreadById(proposalId);
    }

    async findByJob(jobId: string, viewerSupabaseId: string) {
        const { data: viewer, error: viewerError } = await this.supabase.client
            .from('users')
            .select('id, role')
            .eq('supabase_user_id', viewerSupabaseId)
            .maybeSingle();

        if (viewerError) throw viewerError;
        if (!viewer) {
            throw new ForbiddenException('Solo el propietario del job puede ver las propuestas.');
        }

        const { data: job, error: jobError } = await this.supabase.client
            .from('jobs')
            .select('id, client_id')
            .eq('id', jobId)
            .maybeSingle();

        if (jobError) throw jobError;
        if (!job) {
            throw new ForbiddenException('El job no existe.');
        }
        if (job.client_id !== viewer.id) {
            throw new ForbiddenException('Solo el propietario del job puede ver las propuestas.');
        }

        const { data, error } = await this.supabase.client
            .from('proposals')
            .select(`
        *,
        dev:users(name, avatar_url, specialties, rating_avg),
        messages (
          *,
          sender:users!messages_sender_id_fkey(name)
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

    async updateProposalStatus(
        proposalId: string,
        nextStatus: ProposalStatus,
        viewerSupabaseId: string,
    ) {
        if (nextStatus === 'accepted') {
            await this.acceptProposalDirect(proposalId, viewerSupabaseId);
            return this.getProposalThreadById(proposalId);
        }

        const { viewer, proposal, job } = await this.resolveProposalParticipants(proposalId, viewerSupabaseId);
        const isProposalDev = proposal.dev_id === viewer.id;
        const isJobOwner = job.client_id === viewer.id;

        if (!isProposalDev && !isJobOwner) {
            throw new ForbiddenException('Only proposal participants can update the thread status.');
        }

        if (proposal.status === 'completed') {
            throw new ForbiddenException('Completed proposals cannot change status again.');
        }

        this.assertAllowedStatusTransition({
            currentStatus: proposal.status,
            nextStatus,
            isJobOwner,
            isProposalDev,
        });

        const { error: proposalUpdateError } = await this.supabase.client
            .from('proposals')
            .update({ status: nextStatus })
            .eq('id', proposalId);

        if (proposalUpdateError) {
            this.throwFriendlyProposalStatusError(proposalUpdateError);
        }

        const jobStatus = this.resolveJobStatusForProposalStatus(nextStatus, proposal.status, job.status);
        if (jobStatus && jobStatus !== job.status) {
            const { error: jobUpdateError } = await this.supabase.client
                .from('jobs')
                .update({ status: jobStatus })
                .eq('id', job.id);

            if (jobUpdateError) throw jobUpdateError;
        }

        if (nextStatus === 'completed') {
            const { data: devUser, error: devUserError } = await this.supabase.client
                .from('users')
                .select('jobs_completed')
                .eq('id', proposal.dev_id)
                .maybeSingle();

            if (devUserError) throw devUserError;

            const { error: userUpdateError } = await this.supabase.client
                .from('users')
                .update({ jobs_completed: (devUser?.jobs_completed ?? 0) + 1 })
                .eq('id', proposal.dev_id);

            if (userUpdateError) throw userUpdateError;

            await this.cancelSiblingProposalsForClosedJob({
                jobId: job.id,
                winnerProposalId: proposal.id,
            });
        }

        const notice = this.buildProposalStatusNotice(nextStatus);
        const receiverId = isProposalDev ? job.client_id : proposal.dev_id;
        const { error: messageError } = await this.supabase.client
            .from('messages')
            .insert({
                proposal_id: proposal.id,
                sender_id: viewer.id,
                receiver_id: receiverId,
                content: notice,
            });

        if (messageError) throw messageError;
        return this.getProposalThreadById(proposalId);
    }

    async updateProposal(proposalId: string, dto: UpdateProposalDto, viewerSupabaseId: string) {
        const { data: viewer, error: viewerError } = await this.supabase.client
            .from('users')
            .select('id, role')
            .eq('supabase_user_id', viewerSupabaseId)
            .maybeSingle();

        if (viewerError) throw viewerError;
        if (!viewer) {
            throw new ForbiddenException('You do not have permission for this action.');
        }

        const { data: proposal, error: proposalError } = await this.supabase.client
            .from('proposals')
            .select('id, job_id, dev_id, status')
            .eq('id', proposalId)
            .maybeSingle();

        if (proposalError) throw proposalError;
        if (!proposal) {
            throw new ForbiddenException('The proposal no longer exists.');
        }

        if (proposal.dev_id !== viewer.id) {
            throw new ForbiddenException('Only the developer who created the proposal can update it.');
        }

        if (proposal.status !== 'pending') {
            throw new ForbiddenException('Only pending proposals can be updated.');
        }

        const payload: Record<string, unknown> = {};
        if (typeof dto.message === 'string') {
            const trimmedMessage = dto.message.trim();
            if (!trimmedMessage) {
                throw new BadRequestException('Proposal message cannot be empty.');
            }
            payload.message = trimmedMessage;
        }
        if (typeof dto.proposed_price === 'number') {
            payload.proposed_price = dto.proposed_price;
        }
        if (typeof dto.proposed_days === 'number') {
            payload.proposed_days = dto.proposed_days;
        }

        if (Object.keys(payload).length === 0) {
            throw new BadRequestException('Provide at least one proposal field to update.');
        }

        const { data: job, error: jobError } = await this.supabase.client
            .from('jobs')
            .select('client_id')
            .eq('id', proposal.job_id)
            .maybeSingle();

        if (jobError) throw jobError;
        if (!job) {
            throw new ForbiddenException('The job associated with this proposal no longer exists.');
        }

        const { error: updateError } = await this.supabase.client
            .from('proposals')
            .update(payload)
            .eq('id', proposalId);

        if (updateError) throw updateError;

        const updatedProposal = await this.getProposalThreadById(proposalId);
        const updateNotice = this.buildProposalUpdateNotice(updatedProposal);

        const { error: messageError } = await this.supabase.client
            .from('messages')
            .insert({
                proposal_id: proposal.id,
                sender_id: viewer.id,
                receiver_id: job.client_id,
                content: updateNotice,
            });

        if (messageError) throw messageError;
        return this.getProposalThreadById(proposalId);
    }

    async addMessage(proposalId: string, dto: CreateProposalMessageDto, viewerSupabaseId: string) {
        const content = dto.content?.trim();
        if (!content) {
            throw new BadRequestException('Message content cannot be empty.');
        }

        const { data: viewer, error: viewerError } = await this.supabase.client
            .from('users')
            .select('id, role')
            .eq('supabase_user_id', viewerSupabaseId)
            .maybeSingle();

        if (viewerError) throw viewerError;
        if (!viewer) {
            throw new ForbiddenException('You do not have permission for this action.');
        }

        const { data: proposal, error: proposalError } = await this.supabase.client
            .from('proposals')
            .select('id, job_id, dev_id')
            .eq('id', proposalId)
            .maybeSingle();

        if (proposalError) throw proposalError;
        if (!proposal) {
            throw new ForbiddenException('The proposal no longer exists.');
        }

        const { data: job, error: jobError } = await this.supabase.client
            .from('jobs')
            .select('client_id')
            .eq('id', proposal.job_id)
            .maybeSingle();

        if (jobError) throw jobError;
        if (!job) {
            throw new ForbiddenException('The job associated with this proposal no longer exists.');
        }

        const isProposalDev = viewer.id === proposal.dev_id;
        const isJobOwner = viewer.id === job.client_id;
        if (!isProposalDev && !isJobOwner) {
            throw new ForbiddenException('Only proposal participants can send messages in this thread.');
        }

        const receiverId = isProposalDev ? job.client_id : proposal.dev_id;
        const { error: insertError } = await this.supabase.client
            .from('messages')
            .insert({
                proposal_id: proposal.id,
                sender_id: viewer.id,
                receiver_id: receiverId,
                content,
            });

        if (insertError) throw insertError;
        return this.getProposalThreadById(proposalId);
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
        if (!client) {
            throw new ForbiddenException('Solo el propietario del job puede aceptar propuestas.');
        }

        const { data: proposal, error: proposalError } = await this.supabase.client
            .from('proposals')
            .select('id, job_id, dev_id, status')
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
            throw new ForbiddenException('Solo el propietario del job puede aceptar propuestas.');
        }

        if (job.status !== 'open') {
            throw new ForbiddenException(`El job no esta abierto (status actual: ${job.status}).`);
        }

        const { error: acceptError } = await this.supabase.client
            .from('proposals')
            .update({ status: 'accepted' })
            .eq('id', proposal.id);

        if (acceptError) throw acceptError;

        await this.cancelSiblingProposalsForAcceptedJob({
            jobId: proposal.job_id,
            winnerProposalId: proposal.id,
        });

        const { error: jobUpdateError } = await this.supabase.client
            .from('jobs')
            .update({ status: 'assigned' })
            .eq('id', proposal.job_id);

        if (jobUpdateError) throw jobUpdateError;

        return {
            ok: true,
            mode: 'direct',
            proposal_id: proposal.id,
            job_id: proposal.job_id,
            job_status: 'assigned',
        };
    }

    private async resolveProposalParticipants(proposalId: string, viewerSupabaseId: string) {
        const { data: viewer, error: viewerError } = await this.supabase.client
            .from('users')
            .select('id, role')
            .eq('supabase_user_id', viewerSupabaseId)
            .maybeSingle();

        if (viewerError) throw viewerError;
        if (!viewer) {
            throw new ForbiddenException('You do not have permission for this action.');
        }

        const { data: proposal, error: proposalError } = await this.supabase.client
            .from('proposals')
            .select('id, job_id, dev_id, status')
            .eq('id', proposalId)
            .maybeSingle();

        if (proposalError) throw proposalError;
        if (!proposal) {
            throw new ForbiddenException('The proposal no longer exists.');
        }

        const { data: job, error: jobError } = await this.supabase.client
            .from('jobs')
            .select('id, client_id, status')
            .eq('id', proposal.job_id)
            .maybeSingle();

        if (jobError) throw jobError;
        if (!job) {
            throw new ForbiddenException('The job associated with this proposal no longer exists.');
        }

        return { viewer, proposal, job };
    }

    private async getProposalThreadByJobAndDev(jobId: string, devId: string) {
        const { data, error } = await this.supabase.client
            .from('proposals')
            .select(`
        *,
        dev:users(name, avatar_url, specialties, rating_avg),
        messages (
          *,
          sender:users!messages_sender_id_fkey(name)
        )
      `)
            .eq('job_id', jobId)
            .eq('dev_id', devId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return data;
    }

    private async getProposalThreadById(proposalId: string) {
        const { data, error } = await this.supabase.client
            .from('proposals')
            .select(`
        *,
        dev:users(name, avatar_url, specialties, rating_avg),
        messages (
          *,
          sender:users!messages_sender_id_fkey(name)
        )
      `)
            .eq('id', proposalId)
            .single();

        if (error) throw error;
        return data;
    }

    private buildProposalUpdateNotice(proposal: {
        proposed_price?: number | null;
        proposed_days?: number | null;
    }) {
        const price = proposal.proposed_price != null ? `EUR ${proposal.proposed_price}` : 'open budget';
        const days = proposal.proposed_days != null ? `${proposal.proposed_days} days` : 'flexible delivery';
        return `Proposal updated: ${price}, ${days}. Please review the latest scope and terms.`;
    }

    private buildProposalStatusNotice(
        status: ProposalStatus,
    ) {
        const labelMap: Record<string, string> = {
            pending: 'pending',
            accepted: 'accepted',
            rejected: 'rejected',
            in_progress: 'in progress',
            completed: 'completed',
            cancel_requested_owner: 'cancellation requested by the project owner',
            cancel_requested_dev: 'cancellation requested by the developer',
            cancelled: 'cancelled',
        };

        return `Proposal status updated: ${labelMap[status]}.`;
    }

    private resolveJobStatusForProposalStatus(
        nextStatus: ProposalStatus,
        previousStatus: string,
        currentJobStatus: string,
    ) {
        if (nextStatus === 'accepted' || nextStatus === 'in_progress') {
            return 'assigned';
        }

        if (nextStatus === 'completed') {
            return 'closed';
        }

        if (nextStatus === 'cancel_requested_owner' || nextStatus === 'cancel_requested_dev') {
            return currentJobStatus;
        }

        if (nextStatus === 'cancelled') {
            return ['accepted', 'in_progress', 'cancel_requested_owner', 'cancel_requested_dev'].includes(previousStatus)
                ? 'open'
                : currentJobStatus;
        }

        if (nextStatus === 'rejected' && ['accepted', 'in_progress'].includes(previousStatus)) {
            return 'open';
        }

        return currentJobStatus;
    }

    private throwFriendlyProposalStatusError(error: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
        const combined = [error.code, error.message, error.details, error.hint]
            .filter((value) => typeof value === 'string' && value.length)
            .join(' ')
            .toLowerCase();

        if (
            combined.includes('proposals_status_check') ||
            combined.includes('check constraint') ||
            combined.includes('violates check constraint')
        ) {
            throw new BadRequestException(
                'The database schema is missing the latest proposal statuses. Run `modders_market-api/sql/pro_proposal_status_upgrade.sql` and try again.',
            );
        }

        throw new InternalServerErrorException(error.message || 'Could not update the proposal status.');
    }

    private assertAllowedStatusTransition(input: {
        currentStatus: string;
        nextStatus: ProposalStatus;
        isJobOwner: boolean;
        isProposalDev: boolean;
    }) {
        const { currentStatus, nextStatus, isJobOwner, isProposalDev } = input;

        if (nextStatus === 'completed') {
            if (!isProposalDev) {
                throw new ForbiddenException('Only the developer can mark the proposal as completed.');
            }
            if (!['accepted', 'in_progress'].includes(currentStatus)) {
                throw new ForbiddenException('Only accepted or in-progress proposals can be marked as completed.');
            }
            return;
        }

        if (nextStatus === 'cancel_requested_owner') {
            if (!isJobOwner) {
                throw new ForbiddenException('Only the project owner can request cancellation.');
            }
            if (!['accepted', 'in_progress'].includes(currentStatus)) {
                throw new ForbiddenException('Cancellation requests are only available for active proposals.');
            }
            return;
        }

        if (nextStatus === 'cancel_requested_dev') {
            if (!isProposalDev) {
                throw new ForbiddenException('Only the developer can request cancellation.');
            }
            if (!['accepted', 'in_progress'].includes(currentStatus)) {
                throw new ForbiddenException('Cancellation requests are only available for active proposals.');
            }
            return;
        }

        if (nextStatus === 'cancelled') {
            const ownerApproval = isJobOwner && currentStatus === 'cancel_requested_dev';
            const devApproval = isProposalDev && currentStatus === 'cancel_requested_owner';
            if (!ownerApproval && !devApproval) {
                throw new ForbiddenException('Cancellation must be approved by the other party first.');
            }
            return;
        }

        if (isProposalDev) {
            throw new ForbiddenException('Developers cannot set this status on the proposal.');
        }

        if (nextStatus === 'rejected') {
            if (currentStatus !== 'pending') {
                throw new ForbiddenException('Only pending proposals can be rejected.');
            }
            return;
        }

        if (nextStatus === 'in_progress') {
            if (!isProposalDev) {
                throw new ForbiddenException('Only the developer can move the proposal to in progress.');
            }
            if (currentStatus !== 'accepted') {
                throw new ForbiddenException('Only accepted proposals can move to in progress.');
            }
            return;
        }

        throw new ForbiddenException('This proposal status transition is not allowed.');
    }

    private canCreateReplacementProposal(status: string): boolean {
        return status === 'cancelled';
    }

    private buildNewProposalConflictMessage(status: string): string {
        if (status === 'rejected') {
            return 'This proposal was rejected, so you cannot submit a replacement offer for this job.';
        }

        if (status === 'completed') {
            return 'This job already has a completed proposal thread for your account.';
        }

        return 'You already have an active proposal thread for this job.';
    }

    private async cancelSiblingProposalsForAcceptedJob(input: { jobId: string; winnerProposalId: string }) {
        const siblings = await this.listSiblingProposals(input.jobId, input.winnerProposalId);

        for (const sibling of siblings) {
            if (sibling.status !== 'cancelled') {
                const { error: updateError } = await this.supabase.client
                    .from('proposals')
                    .update({ status: 'cancelled' })
                    .eq('id', sibling.id);

                if (updateError) {
                    this.throwFriendlyProposalStatusError(updateError);
                }
            }

            const { error: messageError } = await this.supabase.client
                .from('messages')
                .insert({
                    proposal_id: sibling.id,
                    sender_id: null,
                    receiver_id: sibling.dev_id,
                    content: 'System notice: this proposal was closed because another offer was accepted for the job.',
                });

            if (messageError) throw messageError;
        }
    }

    private async cancelSiblingProposalsForClosedJob(input: { jobId: string; winnerProposalId: string }) {
        const siblings = await this.listSiblingProposals(input.jobId, input.winnerProposalId);

        for (const sibling of siblings) {
            if (sibling.status !== 'cancelled') {
                const { error: updateError } = await this.supabase.client
                    .from('proposals')
                    .update({ status: 'cancelled' })
                    .eq('id', sibling.id);

                if (updateError) {
                    this.throwFriendlyProposalStatusError(updateError);
                }
            }

            const { error: messageError } = await this.supabase.client
                .from('messages')
                .insert({
                    proposal_id: sibling.id,
                    sender_id: null,
                    receiver_id: sibling.dev_id,
                    content: 'System notice: this proposal was closed because the job has been marked as completed.',
                });

            if (messageError) throw messageError;
        }
    }

    private async listSiblingProposals(jobId: string, winnerProposalId: string) {
        const { data, error } = await this.supabase.client
            .from('proposals')
            .select('id, dev_id, status')
            .eq('job_id', jobId)
            .neq('id', winnerProposalId);

        if (error) throw error;
        return data ?? [];
    }
}
