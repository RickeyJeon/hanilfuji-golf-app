create type public.signup_request_status as enum ('pending', 'approved', 'rejected');

create table public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone_e164 text,
  company_name text not null default 'HANIL-FUJI / FUJI GLOBAL',
  department_name text,
  position_title text,
  memo text,
  status public.signup_request_status not null default 'pending',
  linked_member_id uuid references public.club_members (id) on delete set null,
  reviewed_by_member_id uuid references public.club_members (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint signup_requests_name_check check (char_length(trim(full_name)) >= 2),
  constraint signup_requests_contact_check check (email is not null or phone_e164 is not null)
);

create unique index signup_requests_pending_email_idx
on public.signup_requests (lower(email))
where email is not null and status = 'pending';

create unique index signup_requests_pending_phone_idx
on public.signup_requests (phone_e164)
where phone_e164 is not null and status = 'pending';

create or replace function app_private.sync_signup_request_approval()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  matched_member_id uuid;
begin
  if new.status <> 'approved' then
    return new;
  end if;

  select id
    into matched_member_id
  from public.club_members
  where (new.phone_e164 is not null and phone_e164 = new.phone_e164)
     or (new.email is not null and lower(email) = lower(new.email))
  order by created_at
  limit 1;

  if matched_member_id is null then
    insert into public.club_members (
      full_name,
      email,
      phone_e164,
      company_name,
      department_name,
      position_title,
      status
    )
    values (
      new.full_name,
      new.email,
      new.phone_e164,
      new.company_name,
      new.department_name,
      new.position_title,
      'active'
    )
    returning id into matched_member_id;
  else
    update public.club_members
       set full_name = coalesce(new.full_name, public.club_members.full_name),
           email = coalesce(new.email, public.club_members.email),
           phone_e164 = coalesce(new.phone_e164, public.club_members.phone_e164),
           company_name = coalesce(new.company_name, public.club_members.company_name),
           department_name = coalesce(new.department_name, public.club_members.department_name),
           position_title = coalesce(new.position_title, public.club_members.position_title),
           updated_at = timezone('utc', now())
     where id = matched_member_id;
  end if;

  new.linked_member_id = matched_member_id;
  new.reviewed_at = coalesce(new.reviewed_at, timezone('utc', now()));

  insert into public.member_settings (member_id)
  values (matched_member_id)
  on conflict (member_id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.sync_signup_request_approval() from public;

create trigger signup_requests_set_updated_at
before update on public.signup_requests
for each row
execute function app_private.set_updated_at();

create trigger signup_requests_sync_approval
before insert or update on public.signup_requests
for each row
execute function app_private.sync_signup_request_approval();

alter table public.signup_requests enable row level security;

grant insert on public.signup_requests to anon;
grant insert on public.signup_requests to authenticated;
grant select, update on public.signup_requests to authenticated;

create policy "signup_requests_public_insert"
on public.signup_requests
for insert
to anon, authenticated
with check (
  status = 'pending'
  and linked_member_id is null
  and reviewed_by_member_id is null
  and reviewed_at is null
);

create policy "signup_requests_admin_select"
on public.signup_requests
for select
to authenticated
using (app_private.is_admin_user());

create policy "signup_requests_admin_update"
on public.signup_requests
for update
to authenticated
using (app_private.is_admin_user())
with check (app_private.is_admin_user());
