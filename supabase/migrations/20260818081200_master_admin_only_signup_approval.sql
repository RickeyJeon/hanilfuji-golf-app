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
      and member_row.phone_e164 = '01035504581'
      and member_row.role = 'primary_admin'
      and member_row.status = 'active'
  );
$$;

revoke all on function app_private.is_admin_user() from public;
grant execute on function app_private.is_admin_user() to authenticated;
