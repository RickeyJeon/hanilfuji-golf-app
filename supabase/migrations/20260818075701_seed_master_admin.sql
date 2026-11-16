insert into public.club_members (
  full_name,
  phone_e164,
  role,
  status
)
values (
  'Master Admin',
  '01090000020',
  'primary_admin',
  'active'
)
on conflict (phone_e164) do update
set
  role = 'primary_admin',
  status = 'active',
  updated_at = timezone('utc', now());

insert into public.member_settings (member_id)
select id
from public.club_members
where phone_e164 = '01090010001'
on conflict (member_id) do nothing;
