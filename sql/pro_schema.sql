begin;

create extension if not exists "uuid-ossp";

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_role text;
  requested_name text;
begin
  requested_role := lower(coalesce(new.raw_user_meta_data ->> 'role', 'client'));
  if requested_role not in ('client', 'dev', 'admin') then
    requested_role := 'client';
  end if;

  requested_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');

  insert into public.users (
    supabase_user_id,
    email,
    role,
    name
  )
  values (
    new.id,
    coalesce(new.email, ''),
    requested_role,
    coalesce(requested_name, split_part(coalesce(new.email, ''), '@', 1), 'New User')
  )
  on conflict (supabase_user_id) do update
  set email = excluded.email;

  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  supabase_user_id uuid unique references auth.users (id) on delete set null,
  role text not null default 'client'
    check (role = any (array['dev'::text, 'client'::text, 'admin'::text])),
  name text not null,
  avatar_url text,
  bio text,
  specialties text[],
  games text[],
  portfolio_links jsonb not null default '{}'::jsonb,
  discord text,
  rating_avg numeric not null default 0,
  jobs_completed integer not null default 0,
  created_at timestamptz not null default now(),
  hide boolean not null default false
);

create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  game_type text not null,
  task_type text not null,
  budget_min integer,
  budget_max integer,
  duration_days integer,
  client_id uuid references public.users (id) on delete set null,
  status text not null default 'open'
    check (status = any (array['open'::text, 'assigned'::text, 'closed'::text, 'cancelled'::text])),
  created_at timestamptz not null default now(),
  constraint jobs_budget_min_check check (budget_min is null or budget_min >= 0),
  constraint jobs_budget_max_check check (budget_max is null or budget_max >= 0),
  constraint jobs_duration_days_check check (duration_days is null or duration_days >= 1),
  constraint jobs_budget_range_check check (
    budget_min is null
    or budget_max is null
    or budget_min <= budget_max
  )
);

create table if not exists public.proposals (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references public.jobs (id) on delete cascade,
  dev_id uuid references public.users (id) on delete cascade,
  message text,
  proposed_price integer,
  proposed_days integer,
  status text not null default 'pending'
    check (status = any (array['pending'::text, 'accepted'::text, 'rejected'::text, 'in_progress'::text, 'completed'::text, 'cancel_requested_owner'::text, 'cancel_requested_dev'::text, 'cancelled'::text])),
  created_at timestamptz not null default now(),
  constraint proposals_price_check check (proposed_price is null or proposed_price >= 0),
  constraint proposals_days_check check (proposed_days is null or proposed_days >= 1)
);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  proposal_id uuid references public.proposals (id) on delete cascade,
  sender_id uuid references public.users (id) on delete set null,
  receiver_id uuid references public.users (id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_feed_comments (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role);
create index if not exists users_hide_idx on public.users (hide);
create index if not exists jobs_client_id_idx on public.jobs (client_id);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
create index if not exists proposals_job_id_idx on public.proposals (job_id);
create index if not exists proposals_dev_id_idx on public.proposals (dev_id);
create index if not exists proposals_status_idx on public.proposals (status);
create index if not exists messages_proposal_id_idx on public.messages (proposal_id);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists messages_receiver_id_idx on public.messages (receiver_id);
create index if not exists job_feed_comments_job_id_idx on public.job_feed_comments (job_id);
create index if not exists job_feed_comments_author_id_idx on public.job_feed_comments (author_id);
create index if not exists job_feed_comments_created_at_idx on public.job_feed_comments (created_at asc);

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

commit;
