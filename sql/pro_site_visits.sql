begin;

create extension if not exists "uuid-ossp";

create table if not exists public.site_visits (
  id uuid primary key default uuid_generate_v4(),
  ip_address text not null unique,
  first_path text,
  last_path text,
  user_agent text,
  total_hits integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists site_visits_last_seen_at_idx on public.site_visits (last_seen_at desc);
create index if not exists site_visits_first_seen_at_idx on public.site_visits (first_seen_at desc);

commit;
