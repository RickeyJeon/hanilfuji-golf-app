create or replace function public.resolve_login_email(phone_input text)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    email,
    regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g') || '@hanilfuji.local'
  )
  from public.club_members
  where phone_e164 = case
    when length(regexp_replace(coalesce(phone_input, ''), '\D', '', 'g')) = 8
      then '010' || regexp_replace(coalesce(phone_input, ''), '\D', '', 'g')
    else regexp_replace(coalesce(phone_input, ''), '\D', '', 'g')
  end
    and status <> 'inactive'
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
