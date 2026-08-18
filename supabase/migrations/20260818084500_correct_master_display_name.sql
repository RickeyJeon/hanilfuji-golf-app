update public.club_members
set full_name = '전재현'
where phone_e164 = '01035504581';

insert into public.member_settings (member_id, nickname)
select id, '후지전총무'
from public.club_members
where phone_e164 = '01035504581'
on conflict (member_id) do update set nickname = '후지전총무';
