create or replace function public.check_signup_activation(phone_input text, email_input text default null)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.signup_requests
    where phone_e164 = case
      when length(regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')) = 8
        then '010' || regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')
      else regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')
    end
      and (email_input is null or lower(email) = lower(trim(email_input)))
      and status = 'approved'
  );
$$;

revoke all on function public.check_signup_activation(text,text) from public;
grant execute on function public.check_signup_activation(text,text) to anon, authenticated;

create or replace function app_private.confirm_phone_only_auth_user()
returns trigger
language plpgsql
security definer
set search_path = auth, pg_temp
as $$
begin
  if new.email like '%@hanilfuji.local' then
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists confirm_phone_only_auth_user on auth.users;
create trigger confirm_phone_only_auth_user
after insert on auth.users
for each row execute function app_private.confirm_phone_only_auth_user();

drop index if exists public.club_events_legacy_key_uidx;
create unique index club_events_legacy_key_uidx on public.club_events (legacy_key);
