begin;

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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

insert into public.users (
  supabase_user_id,
  email,
  role,
  name
)
select
  au.id,
  coalesce(au.email, ''),
  case
    when lower(coalesce(au.raw_user_meta_data ->> 'role', 'client')) in ('client', 'dev', 'admin')
      then lower(coalesce(au.raw_user_meta_data ->> 'role', 'client'))
    else 'client'
  end,
  coalesce(
    nullif(trim(coalesce(au.raw_user_meta_data ->> 'name', '')), ''),
    split_part(coalesce(au.email, ''), '@', 1),
    'New User'
  )
from auth.users au
left join public.users pu on pu.supabase_user_id = au.id
where pu.id is null;

commit;
