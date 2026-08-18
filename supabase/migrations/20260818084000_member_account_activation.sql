create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  matched_member_id uuid;
  metadata_phone text;
begin
  metadata_phone := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\\D', '', 'g'), '');
  select id into matched_member_id
  from public.club_members
  where (new.email is not null and lower(email) = lower(new.email))
     or (metadata_phone is not null and phone_e164 = metadata_phone)
  order by created_at
  limit 1;

  if matched_member_id is not null then
    update public.club_members
       set auth_user_id = new.id,
           email = coalesce(public.club_members.email, new.email),
           updated_at = timezone('utc', now())
     where id = matched_member_id;
  else
    insert into public.club_members (auth_user_id, full_name, email, phone_e164, status)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'member'), '@', 1)),
      new.email,
      metadata_phone,
      'inactive'
    )
    returning id into matched_member_id;
  end if;

  insert into public.member_settings (member_id) values (matched_member_id)
  on conflict (member_id) do nothing;
  return new;
end;
$$;

create or replace function public.resolve_login_email(phone_input text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.club_members
  where phone_e164 = regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')
    and status = 'active'
    and email is not null
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

create or replace function public.check_signup_activation(phone_input text, email_input text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.signup_requests
    where phone_e164 = regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')
      and lower(email) = lower(trim(email_input))
      and status = 'approved'
  );
$$;

revoke all on function public.check_signup_activation(text, text) from public;
grant execute on function public.check_signup_activation(text, text) to anon, authenticated;
