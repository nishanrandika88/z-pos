create or replace function record_profile_login()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles
  set last_login = now()
  where id = auth.uid();
$$;

grant execute on function record_profile_login() to authenticated;
