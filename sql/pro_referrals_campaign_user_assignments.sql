begin;

create table if not exists public.referral_campaign_users (
  referral_link_id uuid not null references public.referral_links (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  assigned_by_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (referral_link_id, user_id)
);

create index if not exists referral_campaign_users_user_id_idx on public.referral_campaign_users (user_id);
create index if not exists referral_campaign_users_referral_link_id_idx on public.referral_campaign_users (referral_link_id);

commit;
