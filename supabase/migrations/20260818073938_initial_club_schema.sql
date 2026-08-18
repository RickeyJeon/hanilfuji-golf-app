drop view if exists public.member_points_leaderboard cascade;
drop view if exists public.event_attendance_summary cascade;
drop view if exists public.member_directory cascade;
drop table if exists public.membership_fee_statuses cascade;
drop table if exists public.event_scorecards cascade;
drop table if exists public.event_group_members cascade;
drop table if exists public.event_groups cascade;
drop table if exists public.event_attendance_responses cascade;
drop table if exists public.club_events cascade;
drop table if exists public.club_notices cascade;
drop table if exists public.member_settings cascade;
drop table if exists public.member_profiles cascade;
drop table if exists public.club_members cascade;
drop function if exists app_private.handle_new_user() cascade;
drop function if exists app_private.current_member_id() cascade;
drop function if exists app_private.is_admin_user() cascade;
drop function if exists app_private.set_updated_at() cascade;
drop type if exists public.fee_status cascade;
drop type if exists public.meal_preference cascade;
drop type if exists public.attendance_status cascade;
drop type if exists public.event_status cascade;
drop type if exists public.event_type cascade;
drop type if exists public.member_status cascade;
drop type if exists public.app_role cascade;
drop schema if exists app_private cascade;

create extension if not exists pgcrypto;

create type public.app_role as enum ('member', 'assistant_admin', 'primary_admin');
create type public.member_status as enum ('active', 'paused', 'inactive');
create type public.event_type as enum ('screen', 'field', 'social', 'other');
create type public.event_status as enum ('draft', 'published', 'completed', 'cancelled');
create type public.attendance_status as enum ('pending', 'attending', 'declined');
create type public.meal_preference as enum ('none', 'meal', 'no_meal');
create type public.fee_status as enum ('unpaid', 'half', 'paid');

create schema app_private;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.club_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  employee_code text unique,
  full_name text not null,
  email text unique,
  phone_e164 text unique,
  company_name text not null default 'HANIL-FUJI / FUJI GLOBAL',
  department_name text,
  position_title text,
  role public.app_role not null default 'member',
  status public.member_status not null default 'active',
  joined_on date,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint club_members_full_name_check check (char_length(trim(full_name)) >= 2)
);

create or replace function app_private.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
  from public.club_members
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function app_private.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.club_members member_row
    where member_row.auth_user_id = auth.uid()
      and member_row.role in ('assistant_admin', 'primary_admin')
  );
$$;

create table public.member_settings (
  member_id uuid primary key references public.club_members (id) on delete cascade,
  nickname text,
  theme text default 'system',
  notify_event_updates boolean not null default true,
  notify_attendance_deadline boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint member_settings_theme_check check (theme in ('system', 'light', 'dark'))
);

create table public.club_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  published boolean not null default true,
  pinned boolean not null default false,
  author_member_id uuid references public.club_members (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint club_notices_title_check check (char_length(trim(title)) >= 3)
);

create table public.club_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type public.event_type not null default 'screen',
  event_status public.event_status not null default 'draft',
  venue_name text,
  venue_address text,
  course_name text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  attendance_deadline timestamptz,
  published boolean not null default false,
  created_by_member_id uuid references public.club_members (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint club_events_title_check check (char_length(trim(title)) >= 3),
  constraint club_events_end_after_start check (ends_at is null or ends_at >= starts_at),
  constraint club_events_deadline_before_start check (
    attendance_deadline is null or attendance_deadline <= starts_at
  )
);

create table public.event_attendance_responses (
  event_id uuid not null references public.club_events (id) on delete cascade,
  member_id uuid not null references public.club_members (id) on delete cascade,
  attendance public.attendance_status not null default 'pending',
  meal public.meal_preference not null default 'none',
  note text,
  responded_at timestamptz not null default timezone('utc', now()),
  updated_by_member_id uuid references public.club_members (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (event_id, member_id),
  constraint event_attendance_meal_check check (
    (attendance = 'attending' and meal in ('meal', 'no_meal'))
    or (attendance <> 'attending' and meal = 'none')
  )
);

create table public.event_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  title text not null,
  display_order integer not null default 1,
  created_by_member_id uuid references public.club_members (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, display_order)
);

create table public.event_group_members (
  group_id uuid not null references public.event_groups (id) on delete cascade,
  member_id uuid not null references public.club_members (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (group_id, member_id)
);

create table public.event_scorecards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  member_id uuid not null references public.club_members (id) on delete cascade,
  gross_score integer not null,
  handicap_adjustment numeric(6,2) not null default 0,
  net_score numeric(8,2) generated always as (gross_score + handicap_adjustment) stored,
  rank_position integer,
  points_awarded integer not null default 0,
  created_by_member_id uuid references public.club_members (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, member_id),
  constraint event_scorecards_gross_score_check check (gross_score between 40 and 200)
);

create table public.membership_fee_statuses (
  member_id uuid not null references public.club_members (id) on delete cascade,
  fee_year integer not null,
  status public.fee_status not null default 'unpaid',
  memo text,
  updated_by_member_id uuid references public.club_members (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (member_id, fee_year),
  constraint membership_fee_statuses_year_check check (fee_year between 2024 and 2100)
);

create index club_members_auth_user_idx on public.club_members (auth_user_id);
create index club_members_role_idx on public.club_members (role);
create index club_members_status_idx on public.club_members (status);
create index club_notices_published_created_idx on public.club_notices (published, created_at desc);
create index club_events_status_start_idx on public.club_events (event_status, starts_at desc);
create index club_events_deadline_idx on public.club_events (attendance_deadline);
create index event_attendance_member_idx on public.event_attendance_responses (member_id, updated_at desc);
create index event_groups_event_idx on public.event_groups (event_id, display_order);
create index event_scorecards_member_idx on public.event_scorecards (member_id, updated_at desc);
create index membership_fee_statuses_year_idx on public.membership_fee_statuses (fee_year, status);

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  matched_member_id uuid;
begin
  select id
    into matched_member_id
  from public.club_members
  where (new.phone is not null and phone_e164 = new.phone)
     or (new.email is not null and lower(email) = lower(new.email))
  order by created_at
  limit 1;

  if matched_member_id is not null then
    update public.club_members
       set auth_user_id = new.id,
           email = coalesce(public.club_members.email, new.email),
           phone_e164 = coalesce(public.club_members.phone_e164, new.phone),
           updated_at = timezone('utc', now())
     where id = matched_member_id;
  else
    insert into public.club_members (
      auth_user_id,
      full_name,
      email,
      phone_e164
    )
    values (
      new.id,
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        split_part(coalesce(new.email, new.phone, 'member'), '@', 1)
      ),
      new.email,
      new.phone
    )
    returning id into matched_member_id;
  end if;

  insert into public.member_settings (member_id)
  values (matched_member_id)
  on conflict (member_id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public;
revoke all on function app_private.current_member_id() from public;
revoke all on function app_private.is_admin_user() from public;
grant execute on function app_private.current_member_id() to authenticated;
grant execute on function app_private.is_admin_user() to authenticated;

create trigger club_members_set_updated_at
before update on public.club_members
for each row
execute function app_private.set_updated_at();

create trigger member_settings_set_updated_at
before update on public.member_settings
for each row
execute function app_private.set_updated_at();

create trigger club_notices_set_updated_at
before update on public.club_notices
for each row
execute function app_private.set_updated_at();

create trigger club_events_set_updated_at
before update on public.club_events
for each row
execute function app_private.set_updated_at();

create trigger event_attendance_responses_set_updated_at
before update on public.event_attendance_responses
for each row
execute function app_private.set_updated_at();

create trigger event_groups_set_updated_at
before update on public.event_groups
for each row
execute function app_private.set_updated_at();

create trigger event_scorecards_set_updated_at
before update on public.event_scorecards
for each row
execute function app_private.set_updated_at();

create trigger membership_fee_statuses_set_updated_at
before update on public.membership_fee_statuses
for each row
execute function app_private.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function app_private.handle_new_user();

create or replace view public.member_directory
with (security_invoker = true)
as
select
  cm.id,
  cm.full_name,
  ms.nickname,
  cm.company_name,
  cm.department_name,
  cm.position_title,
  cm.role,
  cm.status,
  cm.joined_on
from public.club_members cm
left join public.member_settings ms on ms.member_id = cm.id
where cm.status <> 'inactive';

create or replace view public.event_attendance_summary
with (security_invoker = true)
as
select
  e.id as event_id,
  count(*) filter (where r.attendance = 'attending') as attending_count,
  count(*) filter (where r.attendance = 'declined') as declined_count,
  count(*) filter (where r.attendance = 'pending') as pending_count,
  count(*) filter (where r.meal = 'meal') as meal_count,
  count(*) filter (where r.meal = 'no_meal') as no_meal_count
from public.club_events e
left join public.event_attendance_responses r on r.event_id = e.id
group by e.id;

create or replace view public.member_points_leaderboard
with (security_invoker = true)
as
select
  s.member_id,
  date_part('year', e.starts_at)::int as score_year,
  count(*) as played_events,
  sum(s.points_awarded) as total_points,
  avg(s.gross_score)::numeric(8,2) as avg_gross_score,
  avg(s.net_score)::numeric(8,2) as avg_net_score
from public.event_scorecards s
join public.club_events e on e.id = s.event_id
where e.event_status = 'completed'
group by s.member_id, date_part('year', e.starts_at)::int;

alter table public.club_members enable row level security;
alter table public.member_settings enable row level security;
alter table public.club_notices enable row level security;
alter table public.club_events enable row level security;
alter table public.event_attendance_responses enable row level security;
alter table public.event_groups enable row level security;
alter table public.event_group_members enable row level security;
alter table public.event_scorecards enable row level security;
alter table public.membership_fee_statuses enable row level security;

grant usage on schema public to authenticated;
grant select on public.member_directory to authenticated;
grant select on public.event_attendance_summary to authenticated;
grant select on public.member_points_leaderboard to authenticated;
grant select, insert, update, delete on public.club_members to authenticated;
grant select, insert, update on public.member_settings to authenticated;
grant select, insert, update, delete on public.club_notices to authenticated;
grant select, insert, update, delete on public.club_events to authenticated;
grant select, insert, update on public.event_attendance_responses to authenticated;
grant select, insert, update, delete on public.event_groups to authenticated;
grant select, insert, update, delete on public.event_group_members to authenticated;
grant select, insert, update, delete on public.event_scorecards to authenticated;
grant select, insert, update, delete on public.membership_fee_statuses to authenticated;

create policy "club_members_select_self"
on public.club_members
for select
to authenticated
using (id = app_private.current_member_id());

create policy "club_members_select_admin"
on public.club_members
for select
to authenticated
using (app_private.is_admin_user());

create policy "club_members_admin_write"
on public.club_members
for all
to authenticated
using (app_private.is_admin_user())
with check (app_private.is_admin_user());

create policy "member_settings_select_self_or_admin"
on public.member_settings
for select
to authenticated
using (
  member_id = app_private.current_member_id()
  or app_private.is_admin_user()
);

create policy "member_settings_insert_self_or_admin"
on public.member_settings
for insert
to authenticated
with check (
  member_id = app_private.current_member_id()
  or app_private.is_admin_user()
);

create policy "member_settings_update_self_or_admin"
on public.member_settings
for update
to authenticated
using (
  member_id = app_private.current_member_id()
  or app_private.is_admin_user()
)
with check (
  member_id = app_private.current_member_id()
  or app_private.is_admin_user()
);

create policy "club_notices_select_authenticated"
on public.club_notices
for select
to authenticated
using (published or app_private.is_admin_user());

create policy "club_notices_admin_write"
on public.club_notices
for all
to authenticated
using (app_private.is_admin_user())
with check (app_private.is_admin_user());

create policy "club_events_select_authenticated"
on public.club_events
for select
to authenticated
using (published or app_private.is_admin_user());

create policy "club_events_admin_write"
on public.club_events
for all
to authenticated
using (app_private.is_admin_user())
with check (app_private.is_admin_user());

create policy "event_attendance_select_authenticated"
on public.event_attendance_responses
for select
to authenticated
using (true);

create policy "event_attendance_insert_self_before_deadline"
on public.event_attendance_responses
for insert
to authenticated
with check (
  member_id = app_private.current_member_id()
  and exists (
    select 1
    from public.club_events e
    where e.id = event_id
      and (
        e.attendance_deadline is null
        or timezone('utc', now()) < e.attendance_deadline
      )
  )
);

create policy "event_attendance_update_self_before_deadline"
on public.event_attendance_responses
for update
to authenticated
using (
  member_id = app_private.current_member_id()
  and exists (
    select 1
    from public.club_events e
    where e.id = event_id
      and (
        e.attendance_deadline is null
        or timezone('utc', now()) < e.attendance_deadline
      )
  )
)
with check (
  member_id = app_private.current_member_id()
  and exists (
    select 1
    from public.club_events e
    where e.id = event_id
      and (
        e.attendance_deadline is null
        or timezone('utc', now()) < e.attendance_deadline
      )
  )
);

create policy "event_attendance_admin_write"
on public.event_attendance_responses
for all
to authenticated
using (app_private.is_admin_user())
with check (app_private.is_admin_user());

create policy "event_groups_select_authenticated"
on public.event_groups
for select
to authenticated
using (true);

create policy "event_groups_admin_write"
on public.event_groups
for all
to authenticated
using (app_private.is_admin_user())
with check (app_private.is_admin_user());

create policy "event_group_members_select_authenticated"
on public.event_group_members
for select
to authenticated
using (true);

create policy "event_group_members_admin_write"
on public.event_group_members
for all
to authenticated
using (app_private.is_admin_user())
with check (app_private.is_admin_user());

create policy "event_scorecards_select_authenticated"
on public.event_scorecards
for select
to authenticated
using (true);

create policy "event_scorecards_admin_write"
on public.event_scorecards
for all
to authenticated
using (app_private.is_admin_user())
with check (app_private.is_admin_user());

create policy "membership_fee_select_self_or_admin"
on public.membership_fee_statuses
for select
to authenticated
using (
  member_id = app_private.current_member_id()
  or app_private.is_admin_user()
);

create policy "membership_fee_admin_write"
on public.membership_fee_statuses
for all
to authenticated
using (app_private.is_admin_user())
with check (app_private.is_admin_user());
