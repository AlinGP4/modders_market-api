begin;

alter table public.jobs
  add column if not exists job_images jsonb not null default '[]'::jsonb;

alter table public.jobs
  add column if not exists cover_image_url text;

update public.jobs
set
  job_images = coalesce(job_images, '[]'::jsonb),
  cover_image_url = case
    when cover_image_url is not null then cover_image_url
    when jsonb_typeof(job_images) = 'array' and jsonb_array_length(job_images) > 0
      then job_images ->> 0
    else null
  end
where true;

commit;
