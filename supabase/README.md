# Supabase Backend Notes

Project:
- Name: `hanilfuji-golf-app`
- Ref: `nruqzbxiioxvomjlxfon`
- Region: `ap-southeast-1`

Current migration:
- `supabase/migrations/20260818073938_initial_club_schema.sql`
- `supabase/migrations/20260818075127_signup_request_approval_flow.sql`
- `supabase/migrations/20260818075701_seed_master_admin.sql`

What the schema covers:
- `member_profiles`: 직원/회원 기본 정보와 관리자 권한
- `member_settings`: 닉네임, 테마, 알림 같은 개인 설정
- `club_notices`: 관리자 공지
- `club_events`: 스크린/필드/기타 일정
- `event_attendance_responses`: 참석/불참/식사 응답
- `event_groups`, `event_group_members`: 조편성
- `event_scorecards`: 경기 결과, 순위, 포인트
- `membership_fee_statuses`: 연도별 회비 상태
- `member_directory`, `event_attendance_summary`, `member_points_leaderboard`: 앱 조회용 뷰

Security decisions:
- 모든 공개 테이블에 RLS 활성화
- 일반 회원은 자신의 프로필/설정/회비만 직접 조회
- 참석 응답은 본인만 수정 가능하며 마감 시간 이후 차단
- 관리자(`assistant_admin`, `primary_admin`)만 회원/공지/일정/조편성/스코어/회비 관리 가능
- 전화번호는 `member_directory` 뷰에 노출하지 않음

Current operational notes:
- Public users can create signup requests in `public.signup_requests`
- Admin approval updates `signup_requests.status` to `approved`
- Approval trigger automatically creates or updates the matching `public.club_members` row
- Seeded highest-privilege admin phone: `01035504581`

Recommended next commands:
1. `supabase login`
2. `supabase link --project-ref nruqzbxiioxvomjlxfon`
3. `supabase db push`
4. `supabase migration list`

After the first push:
1. Wire the main app from `localStorage` to Supabase Auth + tables
2. Add admin member/event management screens
3. Add production environment variables in Vercel
