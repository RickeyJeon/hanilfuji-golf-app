alter table public.club_members
  add column if not exists must_change_password boolean not null default false;

update public.club_members
set must_change_password = true
where phone_e164 = '01090000020'
  and role = 'primary_admin';
