create or replace view public.member_score_directory as
select
  cm.id,
  cm.full_name,
  cm.email,
  cm.phone_e164,
  cm.company_name,
  cm.department_name,
  cm.position_title,
  cm.role,
  cm.status,
  ms.nickname
from public.club_members cm
left join public.member_settings ms on ms.member_id = cm.id
where cm.status <> 'inactive';

grant select on public.member_score_directory to authenticated;

alter table public.club_events add column if not exists legacy_key text;
create unique index if not exists club_events_legacy_key_uidx
  on public.club_events (legacy_key)
  where legacy_key is not null;
