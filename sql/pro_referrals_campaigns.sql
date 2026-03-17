begin;

alter table public.referral_links
  alter column user_id drop not null;

alter table public.referral_links
  add column if not exists kind text not null default 'user';

alter table public.referral_links
  add column if not exists label text;

alter table public.referral_links
  add column if not exists created_by_user_id uuid references public.users (id) on delete set null;

alter table public.referral_links
  drop constraint if exists referral_links_kind_check;

alter table public.referral_links
  add constraint referral_links_kind_check
  check (kind = any (array['user'::text, 'campaign'::text]));

update public.referral_links
set kind = 'user'
where kind is null or trim(kind) = '';

alter table public.referral_events
  alter column referrer_user_id drop not null;

create index if not exists referral_links_kind_idx on public.referral_links (kind);

commit;
