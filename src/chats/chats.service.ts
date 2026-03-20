import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';

type ChatParticipant = {
  id: string;
  name: string;
  avatar_url: string | null;
  role: 'client' | 'dev' | 'admin';
};

type DirectMessage = {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
  sender: ChatParticipant;
};

type DirectConversationSummary = {
  id: string;
  created_at: string;
  last_message_at: string;
  participants: ChatParticipant[];
  last_message: DirectMessage | null;
};

type DirectConversationDetail = DirectConversationSummary & {
  messages: DirectMessage[];
  admins_can_view: false;
};

type ChatContact = {
  id: string;
  name: string;
  avatar_url: string | null;
  role: 'client' | 'dev' | 'admin';
  bio: string | null;
};

@Injectable()
export class ChatsService {
  constructor(private readonly supabase: SupabaseService) {}

  async listConversations(
    viewerSupabaseUserId: string,
  ): Promise<DirectConversationSummary[]> {
    const viewer = await this.findViewer(viewerSupabaseUserId);
    const conversationIds = await this.findConversationIdsForUser(viewer.id);
    if (!conversationIds.length) {
      return [];
    }

    return this.buildConversationSummaries(conversationIds, viewer.id);
  }

  async searchContacts(
    viewerSupabaseUserId: string,
    query?: string,
  ): Promise<ChatContact[]> {
    const viewer = await this.findViewer(viewerSupabaseUserId);
    const trimmed = query?.trim();

    if (!trimmed) {
      return [];
    }

    let request = this.supabase.client
      .from('users')
      .select('id, name, avatar_url, role, bio')
      .neq('id', viewer.id)
      .order('name', { ascending: true })
      .limit(12);
    request = request.ilike('name', `%${trimmed}%`);

    const { data, error } = await request;
    if (error) {
      throw error;
    }

    return (data ?? []).map((user) => ({
      id: user.id,
      name: user.name,
      avatar_url: user.avatar_url,
      role: user.role,
      bio: user.bio ?? null,
    }));
  }

  async startConversation(
    viewerSupabaseUserId: string,
    participantUserId: string,
  ): Promise<DirectConversationDetail> {
    const viewer = await this.findViewer(viewerSupabaseUserId);
    if (viewer.id === participantUserId) {
      throw new BadRequestException('You cannot start a chat with yourself.');
    }

    const participant = await this.findUserById(participantUserId);
    if (!participant) {
      throw new NotFoundException('Participant not found.');
    }

    const viewerConversationIds = await this.findConversationIdsForUser(
      viewer.id,
    );
    if (viewerConversationIds.length) {
      const { data, error } = await this.supabase.client
        .from('direct_conversation_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', viewerConversationIds);

      if (error) {
        throw error;
      }

      const match = this.findExistingDirectConversation(
        data ?? [],
        viewer.id,
        participantUserId,
      );

      if (match) {
        return this.findConversation(match, viewerSupabaseUserId);
      }
    }

    const conversationId = randomUUID();
    const { error: conversationError } = await this.supabase.client
      .from('direct_conversations')
      .insert({
        id: conversationId,
      });

    if (conversationError) {
      throw conversationError;
    }

    const { error: participantsError } = await this.supabase.client
      .from('direct_conversation_participants')
      .insert([
        { conversation_id: conversationId, user_id: viewer.id },
        { conversation_id: conversationId, user_id: participantUserId },
      ]);

    if (participantsError) {
      throw participantsError;
    }

    return this.findConversation(conversationId, viewerSupabaseUserId);
  }

  async findConversation(
    conversationId: string,
    viewerSupabaseUserId: string,
  ): Promise<DirectConversationDetail> {
    const viewer = await this.findViewer(viewerSupabaseUserId);
    await this.assertParticipant(conversationId, viewer.id);

    const [
      { data: conversation, error: conversationError },
      participants,
      messages,
    ] = await Promise.all([
      this.supabase.client
        .from('direct_conversations')
        .select('id, created_at')
        .eq('id', conversationId)
        .maybeSingle(),
      this.loadConversationParticipants([conversationId]),
      this.loadMessages([conversationId]),
    ]);

    if (conversationError) {
      throw conversationError;
    }

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    const conversationParticipants = (
      participants.get(conversationId) ?? []
    ).filter((participant) => participant.id !== viewer.id);
    const conversationMessages = messages.get(conversationId) ?? [];
    const lastMessage =
      conversationMessages[conversationMessages.length - 1] ?? null;

    return {
      id: conversation.id,
      created_at: conversation.created_at,
      last_message_at: lastMessage?.created_at ?? conversation.created_at,
      participants: conversationParticipants,
      last_message: lastMessage,
      messages: conversationMessages,
      admins_can_view: false,
    };
  }

  async addMessage(
    conversationId: string,
    dto: CreateDirectMessageDto,
    viewerSupabaseUserId: string,
  ): Promise<DirectConversationDetail> {
    const viewer = await this.findViewer(viewerSupabaseUserId);
    await this.assertParticipant(conversationId, viewer.id);

    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Message content cannot be empty.');
    }

    const { error } = await this.supabase.client
      .from('direct_messages')
      .insert({
        id: randomUUID(),
        conversation_id: conversationId,
        sender_id: viewer.id,
        content,
      });

    if (error) {
      throw error;
    }

    return this.findConversation(conversationId, viewerSupabaseUserId);
  }

  private async findViewer(viewerSupabaseUserId: string) {
    const { data, error } = await this.supabase.client
      .from('users')
      .select('id, role, name, avatar_url')
      .eq('supabase_user_id', viewerSupabaseUserId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new NotFoundException('Authenticated user profile not found.');
    }

    return data;
  }

  private async findUserById(userId: string) {
    const { data, error } = await this.supabase.client
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  private async findConversationIdsForUser(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('direct_conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return Array.from(
      new Set(
        (data ?? []).map((entry) => entry.conversation_id).filter(Boolean),
      ),
    );
  }

  private async buildConversationSummaries(
    conversationIds: string[],
    viewerUserId: string,
  ): Promise<DirectConversationSummary[]> {
    const [
      { data: conversations, error: conversationError },
      participants,
      messages,
    ] = await Promise.all([
      this.supabase.client
        .from('direct_conversations')
        .select('id, created_at')
        .in('id', conversationIds),
      this.loadConversationParticipants(conversationIds),
      this.loadMessages(conversationIds, 1),
    ]);

    if (conversationError) {
      throw conversationError;
    }

    return (conversations ?? [])
      .map((conversation) => {
        const lastMessage = (messages.get(conversation.id) ?? [])[0] ?? null;

        return {
          id: conversation.id,
          created_at: conversation.created_at,
          last_message_at: lastMessage?.created_at ?? conversation.created_at,
          participants: (participants.get(conversation.id) ?? []).filter(
            (participant) => participant.id !== viewerUserId,
          ),
          last_message: lastMessage,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.last_message_at).getTime() -
          new Date(a.last_message_at).getTime(),
      );
  }

  private async loadConversationParticipants(conversationIds: string[]) {
    const { data, error } = await this.supabase.client
      .from('direct_conversation_participants')
      .select('conversation_id, user:users(id, name, avatar_url, role)')
      .in('conversation_id', conversationIds);

    if (error) {
      throw error;
    }

    const participants = new Map<string, ChatParticipant[]>();
    for (const row of data ?? []) {
      const user = Array.isArray(row.user) ? row.user[0] : row.user;
      if (!user) {
        continue;
      }

      const list = participants.get(row.conversation_id) ?? [];
      list.push({
        id: user.id,
        name: user.name,
        avatar_url: user.avatar_url,
        role: user.role,
      });
      participants.set(row.conversation_id, list);
    }

    return participants;
  }

  private async loadMessages(
    conversationIds: string[],
    perConversation?: number,
  ) {
    const { data, error } = await this.supabase.client
      .from('direct_messages')
      .select(
        'id, conversation_id, content, created_at, sender:users!direct_messages_sender_id_fkey(id, name, avatar_url, role)',
      )
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    const grouped = new Map<string, DirectMessage[]>();
    for (const row of data ?? []) {
      const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
      if (!sender) {
        continue;
      }

      const list = grouped.get(row.conversation_id) ?? [];
      list.push({
        id: row.id,
        conversation_id: row.conversation_id,
        content: row.content,
        created_at: row.created_at,
        sender: {
          id: sender.id,
          name: sender.name,
          avatar_url: sender.avatar_url,
          role: sender.role,
        },
      });
      grouped.set(row.conversation_id, list);
    }

    if (!perConversation) {
      return grouped;
    }

    const limited = new Map<string, DirectMessage[]>();
    for (const [conversationId, rows] of grouped.entries()) {
      limited.set(conversationId, rows.slice(-perConversation));
    }
    return limited;
  }

  private async assertParticipant(
    conversationId: string,
    viewerUserId: string,
  ): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('direct_conversation_participants')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', viewerUserId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new ForbiddenException(
        'You do not have access to this conversation.',
      );
    }
  }

  private findExistingDirectConversation(
    rows: Array<{ conversation_id: string; user_id: string }>,
    viewerUserId: string,
    participantUserId: string,
  ): string | null {
    const byConversation = new Map<string, Set<string>>();

    for (const row of rows) {
      const users =
        byConversation.get(row.conversation_id) ?? new Set<string>();
      users.add(row.user_id);
      byConversation.set(row.conversation_id, users);
    }

    for (const [conversationId, users] of byConversation.entries()) {
      if (
        users.size === 2 &&
        users.has(viewerUserId) &&
        users.has(participantUserId)
      ) {
        return conversationId;
      }
    }

    return null;
  }
}
