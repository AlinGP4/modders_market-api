begin;

create extension if not exists "uuid-ossp";

create table if not exists public.referral_links (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid unique references public.users (id) on delete cascade,
  code text not null unique,
  kind text not null default 'user'
    check (kind = any (array['user'::text, 'campaign'::text])),
  label text,
  created_by_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_events (
  id uuid primary key default uuid_generate_v4(),
  referral_link_id uuid not null references public.referral_links (id) on delete cascade,
  referrer_user_id uuid references public.users (id) on delete cascade,
  target_user_id uuid references public.users (id) on delete set null,
  visitor_key text,
  event_type text not null
    check (event_type = any (array['visit'::text, 'login'::text])),
  ip_address text not null,
  path text,
  created_at timestamptz not null default now()
);

create index if not exists referral_links_code_idx on public.referral_links (code);
create index if not exists referral_links_kind_idx on public.referral_links (kind);
create index if not exists referral_events_referral_link_id_idx on public.referral_events (referral_link_id);
create index if not exists referral_events_target_user_id_idx on public.referral_events (target_user_id);
create index if not exists referral_events_event_type_idx on public.referral_events (event_type);
create index if not exists referral_events_created_at_idx on public.referral_events (created_at desc);

commit;
