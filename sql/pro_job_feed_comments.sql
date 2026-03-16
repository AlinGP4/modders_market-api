begin;

create table if not exists public.job_feed_comments (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists job_feed_comments_job_id_idx on public.job_feed_comments (job_id);
create index if not exists job_feed_comments_author_id_idx on public.job_feed_comments (author_id);
create index if not exists job_feed_comments_created_at_idx on public.job_feed_comments (created_at asc);

commit;
