-- HANIL-FUJI extracted Supabase routines, policies, triggers, views, grants and bucket metadata.

-- No member data or credentials. Any hard-coded phone / email in function definitions has been redacted.

-- Review the README before trying this on a blank Supabase project.

CREATE SCHEMA IF NOT EXISTS app_private;



CREATE OR REPLACE FUNCTION app_private.confirm_phone_only_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'auth', 'pg_temp'
AS $function$
begin
  if new.email like 'redacted@example.invalid' then
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = new.id;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION app_private.current_member_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select id
  from public.club_members
  where auth_user_id = auth.uid()
  limit 1;
$function$


CREATE OR REPLACE FUNCTION app_private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  matched_member_id uuid;
  metadata_phone text;
begin
  metadata_phone := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), '');
  if metadata_phone is null and new.email like 'redacted@example.invalid' then
    metadata_phone := nullif(regexp_replace(split_part(new.email, '@', 1), '\D', '', 'g'), '');
  end if;

  select id into matched_member_id
  from public.club_members
  where (new.email is not null and lower(email) = lower(new.email))
     or (metadata_phone is not null and phone_e164 = metadata_phone)
  order by (phone_e164 is not null) desc, created_at
  limit 1;

  if matched_member_id is not null then
    update public.club_members
    set auth_user_id = new.id,
        email = coalesce(public.club_members.email, case when new.email like 'redacted@example.invalid' then null else new.email end),
        updated_at = timezone('utc', now())
    where id = matched_member_id;
  else
    insert into public.club_members (auth_user_id, full_name, email, phone_e164, status)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'member'), '@', 1)),
      case when new.email like 'redacted@example.invalid' then null else new.email end,
      metadata_phone,
      'inactive'
    ) returning id into matched_member_id;
  end if;

  insert into public.member_settings (member_id) values (matched_member_id) on conflict (member_id) do nothing;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION app_private.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1
    from public.club_members member_row
    where member_row.auth_user_id = auth.uid()
      and member_row.phone_e164 = '01000000000'
      and member_row.role = 'primary_admin'
      and member_row.status = 'active'
  );
$function$


CREATE OR REPLACE FUNCTION app_private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION app_private.sync_signup_request_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.admin_approve_signup_request(p_request_id uuid, p_admin_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.signup_requests%rowtype; existing public.club_members%rowtype; new_member public.club_members%rowtype;
begin
 if not exists(select 1 from public.club_members where id=p_admin_member_id and auth_user_id=auth.uid() and status='active' and role in('primary_admin','admin')) then raise exception '관리자 권한이 없습니다.'; end if;
 select * into r from public.signup_requests where id=p_request_id for update;
 if not found then raise exception '가입 신청을 찾을 수 없습니다.'; end if;
 if r.status <> 'pending' then raise exception '이미 처리된 가입 신청입니다.'; end if;
 select * into existing from public.club_members where phone_e164=r.phone_e164 limit 1;
 if found then update public.club_members set full_name=r.full_name,company_name=r.company_name,department_name=r.department_name,position_title=r.position_title,status='active',updated_at=now() where id=existing.id returning * into new_member;
 else insert into public.club_members(full_name,phone_e164,company_name,department_name,position_title,role,status,must_change_password) values(r.full_name,r.phone_e164,r.company_name,r.department_name,r.position_title,'member','active',true) returning * into new_member; end if;
 update public.signup_requests set status='approved',reviewed_by_member_id=p_admin_member_id,reviewed_at=now(),linked_member_id=new_member.id,updated_at=now() where id=r.id;
 return jsonb_build_object('ok',true,'member_id',new_member.id,'full_name',new_member.full_name);
end; $function$


CREATE OR REPLACE FUNCTION public.admin_delete_event_results(p_event_id uuid, p_admin_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  if not exists (select 1 from public.club_members where id=p_admin_member_id and auth_user_id=auth.uid() and status='active' and role in ('primary_admin','assistant_admin')) then
    raise exception '관리자 권한이 없습니다.';
  end if;
  if not exists (select 1 from public.club_events where id=p_event_id and event_status='completed') then
    raise exception '확정된 경기 결과가 아닙니다.';
  end if;
  delete from public.event_scorecards where event_id=p_event_id;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok',true,'event_id',p_event_id,'deleted_scorecards',v_count);
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_delete_member(p_member_id uuid, p_admin_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target public.club_members%rowtype;
  admin public.club_members%rowtype;
  linked_results integer := 0;
begin
  select * into admin from public.club_members where id=p_admin_member_id;
  if admin.id is null or admin.status <> 'active' or admin.role not in ('primary_admin','assistant_admin') then
    raise exception '관리자 권한이 없습니다.';
  end if;

  select * into target from public.club_members where id=p_member_id;
  if target.id is null then raise exception '회원을 찾을 수 없습니다.'; end if;
  if target.role = 'primary_admin' then raise exception 'primary_admin 회원은 삭제할 수 없습니다.'; end if;
  if target.id = admin.id then raise exception '현재 로그인한 관리자 계정은 삭제할 수 없습니다.'; end if;
  if target.status <> 'active' then raise exception '이미 비활성화된 회원입니다.'; end if;

  select count(*) into linked_results from public.event_scorecards where member_id=target.id;

  update public.club_members
     set status='inactive', updated_at=now()
   where id=target.id;

  return jsonb_build_object('ok',true,'member_id',target.id,'full_name',target.full_name,'preserved_results',linked_results);
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_reject_signup_request(p_request_id uuid, p_admin_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not exists(select 1 from public.club_members where id=p_admin_member_id and auth_user_id=auth.uid() and status='active' and role in('primary_admin','assistant_admin')) then
    raise exception '관리자 권한이 없습니다.';
  end if;
  update public.signup_requests set status='rejected',reviewed_by_member_id=p_admin_member_id,reviewed_at=now(),updated_at=now() where id=p_request_id and status='pending';
  if not found then raise exception '처리할 가입 신청이 없거나 이미 처리되었습니다.'; end if;
  return jsonb_build_object('ok',true,'status','rejected');
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_reset_month_results(p_year integer, p_month integer, p_admin_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_month < 1 or p_month > 12 then raise exception '올바르지 않은 월입니다.'; end if;
  if not exists (select 1 from public.club_members where id=p_admin_member_id and auth_user_id=auth.uid() and status='active' and role in ('primary_admin','assistant_admin')) then
    raise exception '관리자 권한이 없습니다.';
  end if;
  v_start := make_timestamptz(p_year,p_month,1,0,0,0,'Asia/Seoul');
  v_end := v_start + interval '1 month';
  delete from public.event_scorecards s using public.club_events e
   where s.event_id=e.id and e.event_status='completed' and e.starts_at >= v_start and e.starts_at < v_end;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok',true,'year',p_year,'month',p_month,'deleted_scorecards',v_count);
end;
$function$


CREATE OR REPLACE FUNCTION public.approve_signup_request_db(p_request_id uuid, p_admin_member_id uuid, p_auth_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.signup_requests%rowtype; existing public.club_members%rowtype; linked public.club_members%rowtype; new_member public.club_members%rowtype;
begin
  if not exists(select 1 from public.club_members where id=p_admin_member_id and auth_user_id is not null and status='active' and role in ('primary_admin','assistant_admin')) then raise exception '관리자 권한이 없습니다.'; end if;
  select * into r from public.signup_requests where id=p_request_id for update;
  if not found then raise exception '가입 신청을 찾을 수 없습니다.'; end if;
  if r.status <> 'pending' then raise exception '이미 처리된 가입 신청입니다.'; end if;
  if p_auth_user_id is null then raise exception 'Auth 사용자 연결 정보가 없습니다.'; end if;
  select * into linked from public.club_members where auth_user_id=p_auth_user_id limit 1 for update;
  if found then raise exception '기존 Auth 계정은 이미 다른 회원정보에 연결되어 있습니다. 기존 계정은 변경하지 않습니다.'; end if;
  select * into existing from public.club_members where phone_e164=r.phone_e164 or (r.email is not null and lower(email)=lower(r.email)) order by created_at limit 1 for update;
  if found then
    if existing.auth_user_id is not null then raise exception '기존 회원 재가입은 처리할 수 없습니다. 기존 회원의 Auth 계정이 이미 연결되어 있습니다.'; end if;
    if existing.role in ('primary_admin','assistant_admin') then raise exception '기존 관리자 계정은 가입 승인으로 변경할 수 없습니다.'; end if;
    update public.club_members set full_name=r.full_name,email=r.email,phone_e164=r.phone_e164,company_name=r.company_name,department_name=r.department_name,position_title=r.position_title,auth_user_id=p_auth_user_id,must_change_password=true,status='active',updated_at=now() where id=existing.id returning * into new_member;
  else
    insert into public.club_members(auth_user_id,full_name,email,phone_e164,company_name,department_name,position_title,role,status,must_change_password) values(p_auth_user_id,r.full_name,r.email,r.phone_e164,r.company_name,r.department_name,r.position_title,'member','active',true) returning * into new_member;
  end if;
  insert into public.member_settings(member_id,nickname) values(new_member.id,nullif(trim(r.nickname),'')) on conflict(member_id) do update set nickname=excluded.nickname,updated_at=now();
  update public.signup_requests set status='approved',reviewed_by_member_id=p_admin_member_id,reviewed_at=now(),linked_member_id=new_member.id,updated_at=now() where id=r.id;
  return jsonb_build_object('ok',true,'member_id',new_member.id,'full_name',new_member.full_name,'nickname',r.nickname,'auth_user_id',p_auth_user_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.check_signup_activation(phone_input text, email_input text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.club_members
    where phone_e164 = case
      when length(regexp_replace(coalesce(phone_input, ''), '\D', '', 'g')) = 8
        then '010' || regexp_replace(coalesce(phone_input, ''), '\D', '', 'g')
      else regexp_replace(coalesce(phone_input, ''), '\D', '', 'g')
    end
      and status = 'active'
      and auth_user_id is null
  )
  or exists (
    select 1 from public.signup_requests
    where phone_e164 = case
      when length(regexp_replace(coalesce(phone_input, ''), '\D', '', 'g')) = 8
        then '010' || regexp_replace(coalesce(phone_input, ''), '\D', '', 'g')
      else regexp_replace(coalesce(phone_input, ''), '\D', '', 'g')
    end
      and (email_input is null or lower(email) = lower(trim(email_input)))
      and status = 'approved'
  );
$function$


CREATE OR REPLACE FUNCTION public.create_member_notification(p_type text, p_source_id uuid, p_title text, p_body text, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.member_notifications(notification_type,source_id,title,body,actor_member_id)
  values(p_type,p_source_id,p_title,p_body,p_actor)
  on conflict (notification_type,source_id) do nothing;
end;
$function$


CREATE OR REPLACE FUNCTION public.notify_event_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op='INSERT' and coalesce(new.published,true)) or (tg_op='UPDATE' and coalesce(new.published,false) and not coalesce(old.published,false)) then
    perform public.create_member_notification('event',new.id,new.title,coalesce(to_char(new.starts_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'),'일정 등록'),new.created_by_member_id);
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.notify_group_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ev_title text;
begin
  select title into ev_title from public.club_events where id=new.event_id;
  perform public.create_member_notification('grouping',new.id,coalesce(ev_title,'조편성'),'새로운 조편성이 등록되었습니다.',new.created_by_member_id);
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.notify_notice_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op='INSERT' and coalesce(new.published,true)) or (tg_op='UPDATE' and coalesce(new.published,false) and not coalesce(old.published,false)) then
    perform public.create_member_notification('notice',new.id,new.title,left(coalesce(new.content,''),160),new.author_member_id);
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.resolve_login_email(phone_input text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    email,
    regexp_replace(coalesce(phone_e164, ''), '\\D', '', 'g') || '@hanilfuji.local'
  )
  from public.club_members
  where phone_e164 = case
    when length(regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')) = 8
      then '010' || regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')
    else regexp_replace(coalesce(phone_input, ''), '\\D', '', 'g')
  end
    and status <> 'inactive'
  limit 1;
$function$


CREATE OR REPLACE VIEW public."event_attendance_summary" AS
SELECT e.id AS event_id,
    count(*) FILTER (WHERE (r.attendance = 'attending'::attendance_status)) AS attending_count,
    count(*) FILTER (WHERE (r.attendance = 'declined'::attendance_status)) AS declined_count,
    count(*) FILTER (WHERE (r.attendance = 'pending'::attendance_status)) AS pending_count,
    count(*) FILTER (WHERE (r.meal = 'meal'::meal_preference)) AS meal_count,
    count(*) FILTER (WHERE (r.meal = 'no_meal'::meal_preference)) AS no_meal_count
   FROM (club_events e
     LEFT JOIN event_attendance_responses r ON ((r.event_id = e.id)))
  GROUP BY e.id;

CREATE OR REPLACE VIEW public."member_directory" AS
SELECT cm.id,
    cm.full_name,
    ms.nickname,
    cm.company_name,
    cm.department_name,
    cm.position_title,
    cm.role,
    cm.status,
    cm.joined_on
   FROM (club_members cm
     LEFT JOIN member_settings ms ON ((ms.member_id = cm.id)))
  WHERE (cm.status <> 'inactive'::member_status);

CREATE OR REPLACE VIEW public."member_points_leaderboard" AS
SELECT s.member_id,
    (date_part('year'::text, e.starts_at))::integer AS score_year,
    count(*) AS played_events,
    sum(s.points_awarded) AS total_points,
    (avg(s.gross_score))::numeric(8,2) AS avg_gross_score,
    (avg(s.net_score))::numeric(8,2) AS avg_net_score
   FROM (event_scorecards s
     JOIN club_events e ON ((e.id = s.event_id)))
  WHERE (e.event_status = 'completed'::event_status)
  GROUP BY s.member_id, ((date_part('year'::text, e.starts_at))::integer);

CREATE OR REPLACE VIEW public."member_score_directory" AS
SELECT cm.id,
    cm.full_name,
    cm.email,
    cm.phone_e164,
    cm.company_name,
    cm.department_name,
    cm.position_title,
    cm.role,
    cm.status,
    ms.nickname
   FROM (club_members cm
     LEFT JOIN member_settings ms ON ((ms.member_id = cm.id)))
  WHERE (cm.status <> 'inactive'::member_status);

CREATE POLICY "club_events_admin_write" ON "public"."club_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin_user()) WITH CHECK (app_private.is_admin_user());

CREATE POLICY "club_events_select_authenticated" ON "public"."club_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((published OR app_private.is_admin_user()));

CREATE POLICY "club_members_admin_write" ON "public"."club_members" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin_user()) WITH CHECK (app_private.is_admin_user());

CREATE POLICY "club_members_select_admin" ON "public"."club_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_admin_user());

CREATE POLICY "club_members_select_self" ON "public"."club_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id = app_private.current_member_id()));

CREATE POLICY "club_notices_admin_write" ON "public"."club_notices" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin_user()) WITH CHECK (app_private.is_admin_user());

CREATE POLICY "club_notices_select_authenticated" ON "public"."club_notices" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((published OR app_private.is_admin_user()));

CREATE POLICY "event_attendance_admin_write" ON "public"."event_attendance_responses" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin_user()) WITH CHECK (app_private.is_admin_user());

CREATE POLICY "event_attendance_insert_self_before_deadline" ON "public"."event_attendance_responses" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((member_id = app_private.current_member_id()) AND (EXISTS ( SELECT 1
   FROM club_events e
  WHERE ((e.id = event_attendance_responses.event_id) AND ((e.attendance_deadline IS NULL) OR (timezone('utc'::text, now()) < e.attendance_deadline)))))));

CREATE POLICY "event_attendance_select_authenticated" ON "public"."event_attendance_responses" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "event_attendance_update_self_before_deadline" ON "public"."event_attendance_responses" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((member_id = app_private.current_member_id()) AND (EXISTS ( SELECT 1
   FROM club_events e
  WHERE ((e.id = event_attendance_responses.event_id) AND ((e.attendance_deadline IS NULL) OR (timezone('utc'::text, now()) < e.attendance_deadline))))))) WITH CHECK (((member_id = app_private.current_member_id()) AND (EXISTS ( SELECT 1
   FROM club_events e
  WHERE ((e.id = event_attendance_responses.event_id) AND ((e.attendance_deadline IS NULL) OR (timezone('utc'::text, now()) < e.attendance_deadline)))))));

CREATE POLICY "event_group_members_admin_write" ON "public"."event_group_members" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin_user()) WITH CHECK (app_private.is_admin_user());

CREATE POLICY "event_group_members_select_authenticated" ON "public"."event_group_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "event_groups_admin_write" ON "public"."event_groups" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin_user()) WITH CHECK (app_private.is_admin_user());

CREATE POLICY "event_groups_select_authenticated" ON "public"."event_groups" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "event_scorecards_admin_write" ON "public"."event_scorecards" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin_user()) WITH CHECK (app_private.is_admin_user());

CREATE POLICY "event_scorecards_select_authenticated" ON "public"."event_scorecards" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "authenticated members can read notifications" ON "public"."member_notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "member_settings_insert_self_or_admin" ON "public"."member_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((member_id = app_private.current_member_id()) OR app_private.is_admin_user()));

CREATE POLICY "member_settings_select_self_or_admin" ON "public"."member_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((member_id = app_private.current_member_id()) OR app_private.is_admin_user()));

CREATE POLICY "member_settings_update_self_or_admin" ON "public"."member_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((member_id = app_private.current_member_id()) OR app_private.is_admin_user())) WITH CHECK (((member_id = app_private.current_member_id()) OR app_private.is_admin_user()));

CREATE POLICY "membership_fee_admin_write" ON "public"."membership_fee_statuses" AS PERMISSIVE FOR ALL TO "authenticated" USING (app_private.is_admin_user()) WITH CHECK (app_private.is_admin_user());

CREATE POLICY "membership_fee_select_self_or_admin" ON "public"."membership_fee_statuses" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((member_id = app_private.current_member_id()) OR app_private.is_admin_user()));

CREATE POLICY "members can read own push subscriptions" ON "public"."push_subscriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((member_id = app_private.current_member_id()));

CREATE POLICY "members can register own push subscriptions" ON "public"."push_subscriptions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((member_id = app_private.current_member_id()));

CREATE POLICY "members can remove own push subscriptions" ON "public"."push_subscriptions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((member_id = app_private.current_member_id()));

CREATE POLICY "members can update own push subscriptions" ON "public"."push_subscriptions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((member_id = app_private.current_member_id())) WITH CHECK ((member_id = app_private.current_member_id()));

CREATE POLICY "signup_requests_admin_select" ON "public"."signup_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (app_private.is_admin_user());

CREATE POLICY "signup_requests_admin_update" ON "public"."signup_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (app_private.is_admin_user()) WITH CHECK (app_private.is_admin_user());

CREATE POLICY "signup_requests_public_insert" ON "public"."signup_requests" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (((status = 'pending'::signup_request_status) AND (linked_member_id IS NULL) AND (reviewed_by_member_id IS NULL) AND (reviewed_at IS NULL)));

CREATE POLICY "event notices admin delete" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'event-notices'::text) AND (EXISTS ( SELECT 1
   FROM club_members m
  WHERE ((m.auth_user_id = auth.uid()) AND (m.status = 'active'::member_status) AND (m.role = ANY (ARRAY['primary_admin'::app_role, 'assistant_admin'::app_role])))))));

CREATE POLICY "event notices admin update" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'event-notices'::text) AND (EXISTS ( SELECT 1
   FROM club_members m
  WHERE ((m.auth_user_id = auth.uid()) AND (m.status = 'active'::member_status) AND (m.role = ANY (ARRAY['primary_admin'::app_role, 'assistant_admin'::app_role]))))))) WITH CHECK (((bucket_id = 'event-notices'::text) AND (EXISTS ( SELECT 1
   FROM club_members m
  WHERE ((m.auth_user_id = auth.uid()) AND (m.status = 'active'::member_status) AND (m.role = ANY (ARRAY['primary_admin'::app_role, 'assistant_admin'::app_role])))))));

CREATE POLICY "event notices admin upload" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'event-notices'::text) AND (EXISTS ( SELECT 1
   FROM club_members m
  WHERE ((m.auth_user_id = auth.uid()) AND (m.status = 'active'::member_status) AND (m.role = ANY (ARRAY['primary_admin'::app_role, 'assistant_admin'::app_role])))))));

CREATE POLICY "event notices public read" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'event-notices'::text));

CREATE POLICY "event_notice_images_admin_delete" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'event-notices'::text) AND app_private.is_admin_user()));

CREATE POLICY "event_notice_images_admin_insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'event-notices'::text) AND app_private.is_admin_user()));

CREATE POLICY "event_notice_images_admin_update" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'event-notices'::text) AND app_private.is_admin_user())) WITH CHECK (((bucket_id = 'event-notices'::text) AND app_private.is_admin_user()));

CREATE POLICY "event_notice_images_public_read" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'event-notices'::text));

CREATE POLICY "event_notices_admin_delete" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'event-notices'::text) AND app_private.is_admin_user()));

CREATE POLICY "event_notices_admin_insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'event-notices'::text) AND app_private.is_admin_user()));

CREATE POLICY "event_notices_admin_update" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'event-notices'::text) AND app_private.is_admin_user())) WITH CHECK (((bucket_id = 'event-notices'::text) AND app_private.is_admin_user()));

CREATE POLICY "event_notices_public_read" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'event-notices'::text));

CREATE TRIGGER confirm_phone_only_auth_user AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION app_private.confirm_phone_only_auth_user();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION app_private.handle_new_user();

CREATE TRIGGER club_events_set_updated_at BEFORE UPDATE ON club_events FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_notify_event_change AFTER INSERT OR UPDATE OF published ON club_events FOR EACH ROW EXECUTE FUNCTION notify_event_change();

CREATE TRIGGER club_members_set_updated_at BEFORE UPDATE ON club_members FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER club_notices_set_updated_at BEFORE UPDATE ON club_notices FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_notify_notice_change AFTER INSERT OR UPDATE OF published ON club_notices FOR EACH ROW EXECUTE FUNCTION notify_notice_change();

CREATE TRIGGER event_attendance_responses_set_updated_at BEFORE UPDATE ON event_attendance_responses FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER event_groups_set_updated_at BEFORE UPDATE ON event_groups FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_notify_group_change AFTER INSERT ON event_groups FOR EACH ROW EXECUTE FUNCTION notify_group_change();

CREATE TRIGGER event_scorecards_set_updated_at BEFORE UPDATE ON event_scorecards FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER member_settings_set_updated_at BEFORE UPDATE ON member_settings FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER membership_fee_statuses_set_updated_at BEFORE UPDATE ON membership_fee_statuses FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER push_subscriptions_set_updated_at BEFORE UPDATE ON push_subscriptions FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER signup_requests_set_updated_at BEFORE UPDATE ON signup_requests FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER signup_requests_sync_approval BEFORE INSERT OR UPDATE ON signup_requests FOR EACH ROW EXECUTE FUNCTION app_private.sync_signup_request_approval();

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."club_events" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."club_events" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."club_events" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."club_members" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."club_members" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."club_members" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."club_notices" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."club_notices" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."club_notices" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_attendance_responses" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_attendance_responses" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_attendance_responses" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_attendance_summary" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_attendance_summary" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_attendance_summary" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_group_members" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_group_members" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_group_members" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_groups" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_groups" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_groups" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_reminder_log" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_reminder_log" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_reminder_log" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_scorecards" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_scorecards" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."event_scorecards" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_directory" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_directory" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_directory" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_notifications" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_notifications" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_notifications" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_points_leaderboard" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_points_leaderboard" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_points_leaderboard" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_score_directory" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_score_directory" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_score_directory" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_settings" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_settings" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."member_settings" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."membership_fee_statuses" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."membership_fee_statuses" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."membership_fee_statuses" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."push_subscriptions" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."push_subscriptions" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."push_subscriptions" TO "service_role";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."signup_requests" TO "anon";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."signup_requests" TO "authenticated";

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."signup_requests" TO "service_role";

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('event-notices','event-notices',true,2097152,ARRAY['image/jpeg','image/png','image/webp']::text[]) ON CONFLICT(id) DO NOTHING;
