# 2026 하반기 SPA 제출용 — HANIL-FUJI 골프동호회 앱

> 추출 기준: 2026-11-16 / 출처: GitHub + 운영 Supabase의 **읽기 전용** 메타데이터 및 Edge Function 소스
> 원래 운영 중인 GitHub `main` 브랜치, Vercel 배포, Supabase 테이블/회원/스코어에는 변경을 가하지 않았습니다.

## 1. 제출물 구조

- `index.html`, `*.js`, `sw.js`, `manifest.json` 등: 기존 GitHub 프런트엔드 앱
- `supabase/functions/<함수명>/index.ts`: 운영 중인 Edge Function **9개 소스**
- `submission/database_schema_core.sql`: 실제 운영 DB의 **public 테이블 13개, enum 8개, 컬럼 124개, 제약조건 55개, 인덱스 14개, RLS 상태**에 대한 구조 정의
- `submission/database_schema_routines_policies.sql`: **함수 18개 (public 12 + app_private 6), 정책 42개 (public 30 + storage 12), 트리거 16개, 뷰 4개, 권한과 Storage 버킷 구조**
- `submission/README.md`: 이 문서
- `submission/ENVIRONMENT.example`: 필수 환경변수 이름 (실제 비밀값 없음)
- `supabase/migrations/`: 기존 GitHub에 들어 있던 과거 마이그레이션 파일들. 아래 주의사항을 확인하세요.

## 2. 확인된 원본 및 누락 사항

Supabase에서 운영 중인 Edge Function은 10개입니다.

✅ 추출됨: `approve-signup`, `approve-signup-v2`, `approve-signup-v3`,
`issue-temp-password`, `complete-password-change`,
`admin-temp-password-v2`, `admin-notice-v2`, `send-push`, `event-d1-reminder`.

⚠️ **`seed-member-auth` 원본 소스는 미포함**:
초기 계정을 생성하며 초기 비밀번호를 설정하는 민감한 코드로, 추출 후 GitHub 브랜치 저장 요청이 보안 검사에서 차단되었습니다.
운영 환경에는 함수가 존재하지만, 이 제출본에는 포함하지 못했습니다.
따라서 **'10개 함수 전체 소스 확보'라고 주장하지 마세요.** 복제 환경에서 회원 계정을 초기화하려면 별도의 안전한 부트스트랩이 필요합니다.

## 3. 실행/설치 절차 및 한계

**주의: 이 ZIP은 운영 앱의 소스 보관본이지, 클릭 한 번에 독립 실행되는 완제품은 아닙니다.**
운영 앱 주소: https://hanilfuji-golf-app.vercel.app

개발자 검증 과정의 개요:
1. 기존 서비스와 완전히 분리된 **별도 Supabase 프로젝트** 및 정적 웹 호스팅 준비.
2. Supabase가 제공하는 `auth`, `storage`, `extensions` 스키마 및 필수 확장을 준비.
3. `submission/database_schema_core.sql`과 `submission/database_schema_routines_policies.sql`을 참고하여 **서로 충돌하지 않도록 정리한 마이그레이션** 작성.
4. 저장된 Edge Function을 배포하고 필요한 환경변수(아래 예시)를 별도 지정.
5. 브라우저에 배포할 `index.html`의 **운영 Supabase URL/공개키를 테스트 프로젝트 값으로 변경** 후 호스팅.
6. 테스트 회원을 새로 등록하고 로그인·일정·조편성·스코어·알림 순서로 검증.

**실제 클린 설치 및 전체 기능 연동 테스트는 아직 수행하지 않았습니다.**
기존 `supabase/migrations/`을 2개의 구조 스냅샷 SQL과 **중복으로 일괄 실행하지 마세요**.
원본 마이그레이션에는 초기 관리자 식별정보 등 실제 운영값이 일부 남아 있을 수 있습니다.
두 구조 SQL에는 개인 행 데이터가 없지만, 함수 정의 안의 하드코딩된 휴대폰/이메일 값 **5건은 가명 처리**되었습니다. 복제 시 인증/권한 로직을 반드시 점검하세요.

## 4. 개인정보 및 보안

- 새로 추출한 SQL은 **테이블의 설계도**를 담고 있으며 회원 이름, 연락처, 스코어, 참석 기록 행 등은 복사하지 않았습니다.
- Supabase 서비스 역할 키, DB 비밀번호, 실제 VAPID 개인키를 포함하지 않았습니다.
- ⚠️ **기존 GitHub 프런트엔드 및 과거 마이그레이션에는 하드코딩된 운영용 관리자 전화번호, 과거 예시 회원명 등이 포함돼 있을 수 있습니다.**
  따라서 회사 전체 공유 전에 원본 소스를 별도로 비식별화하는 보안 검토가 필요합니다.
- 정적 프런트엔드의 Supabase **publishable key는 공개키**이며 비밀키가 아니지만, 서버 프로젝트 주소가 운영 환경을 가리킵니다.
- 심사위원에게 운영 관리자 계정, 회원의 로그인 비밀번호, 서버 서비스 역할 키는 **전달하지 마세요**.

## 5. SPA 심사 제출 팁

소스 ZIP 외에, 실제 앱 화면이 들어간 사용 매뉴얼 PDF, 시연 영상,
본부장 확인서(활용 인원·운영 기간·시간 절감 근거·정착 여부)를 별도 제출하세요.
이 브랜치에 추가한 파일은 **소스 추출 자료**이며 사용 매뉴얼/본부장 확인서를 대신하지 않습니다.

## 6. 2026-11-16 제출용 정적 점검 및 운영 DB 진단

- 원본 GitHub ZIP: 별도 JavaScript 파일 17개 및 HTML 내부 스크립트 9개를 Node.js 문법 검사하여 오류 없음. **실제 브라우저·Supabase 연동 통합 테스트를 뜻하지 않음.**
- SPA 제출 브랜치의 `index.html`, `hanil_fuji_mobile_ui_v27.html`에 들어 있던 초기 명단 26명과 중복 제외 연락처 27종을 **샘플 이름·가상 번호로 치환**. 과거 마이그레이션 및 안내 파일의 고정 연락처도 치환.
- **추가 수동 검토가 필요함:** 직원 이름이 다른 텍스트/주석에 남아 있는지, 실제 업무 부서·직위가 개인을 재식별하게 만들 수 있는지, 이전의 예시 스냅샷/이력 파일, 계정 식별정보 및 운영 프로젝트 URL/공개키 등.
- 운영 Supabase Security Advisor 확인 결과: `member_score_directory`의 SECURITY DEFINER VIEW 1건(ERROR), 익명으로 실행 가능한 SECURITY DEFINER DB 함수 7개(WARN), 로그인 사용자 실행 가능 함수 10개(WARN), search_path 미지정 1건(WARN), 유출 비밀번호 보호 미설정 1건(WARN), RLS만 있고 정책이 없는 로그 테이블 1건(INFO).
- 이 경고들은 **운영 시스템 자체에 관한 진단**이며 이번 소스 추출에서 발생한 것은 아님. 실제 악용 가능성은 각 함수의 내부 권한 검증 확인 후 판단해야 함. 운영 DB 권한과 설정은 **변경하지 않았음**.
- 보안 경고 참고: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
- 사용자에게 최종 전달하기 전 추가 비식별화 및 테스트 프로젝트 실행 검증 권장. ZIP을 전체 실행 검증 완료본이라고 표시하지 마세요.
