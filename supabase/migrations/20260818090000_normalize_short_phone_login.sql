create or replace function public.resolve_login_email(phone_input text)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select email
  from public.club_members
  where phone_e164 = case
    when length(regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')) = 8
      then '010' || regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')
    else regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')
  end
    and email is not null
    and status <> 'inactive'
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

create or replace function public.check_signup_activation(phone_input text, email_input text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.signup_requests
    where phone_e164 = case
      when length(regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')) = 8
        then '010' || regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')
      else regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')
    end
      and lower(email) = lower(trim(email_input))
      and status = 'approved'
  );
$$;

revoke all on function public.check_signup_activation(text, text) from public;
grant execute on function public.check_signup_activation(text, text) to anon, authenticated;
