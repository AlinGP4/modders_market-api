create extension if not exists pgcrypto;

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.direct_conversation_participants (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists direct_conversation_participants_user_idx
  on public.direct_conversation_participants(user_id, created_at desc);

create index if not exists direct_messages_conversation_idx
  on public.direct_messages(conversation_id, created_at asc);

comment on table public.direct_conversations is
  '1:1 private chats between platform users. Admins are not granted global read access by default.';
