update public.club_members
set full_name = '테스트관리자'
where phone_e164 = '01090000020';

insert into public.member_settings (member_id, nickname)
select id, '후지전총무'
from public.club_members
where phone_e164 = '01090010001'
on conflict (member_id) do update set nickname = '후지전총무';
