# Learners Quest Supabase 스키마

Learners Quest(`quest/`)의 데이터 저장소. 프론트는 지금처럼 n8n 웹훅만 호출하고, n8n이 전용 DB 역할 `n8n_quest`로 Supabase Postgres에 접속한다. 인증(`dl_sessions`, 패스키)과 푸시 구독(`quest_push_subs`)은 n8n data table에 남아 있다.

## 마이그레이션

Supabase 대시보드 SQL Editor에서 파일 이름 순서대로 실행한다. 이미 만든 객체는 건너뛰도록 작성했다.

| 파일 | 내용 |
|---|---|
| `20261118000100_quest_social.sql` | 회원·친구·스냅샷·응원·친구 신청·파티 테이블, 랭킹 뷰 `quest_league_board`, 함수 `quest_global_league`, `quest_social_ctx` |
| `20261118000200_quest_core_rls.sql` | `quest_logs`, `quest_config`, 역할 `n8n_quest`, anon/authenticated 차단, 명령별 RLS 정책 |
| `20261118000300_quest_import.sql` | n8n data table에서 옮겨 오는 일회성 함수(`quest_import` 스키마). 이관 확인 후 `drop schema quest_import cascade;` |
| `20261118000400_quest_gifts.sql` | 친구 선물 `quest_gifts` (친구 사이·하루 3번 RLS, 받음 처리만 UPDATE) |

## 접근 제어 요약

- `anon`, `authenticated`: 모든 테이블 권한 회수 + RLS 정책 없음. Supabase REST·Realtime으로는 아무 행도 보이지 않는다.
- `n8n_quest`: 테이블별로 필요한 명령만 GRANT. DELETE는 `quest_logs`만 가능. 비활성 회원은 RLS로 숨김. 응원은 친구 사이에서만, 비공개 회원에게는 새 친구 신청을 넣을 수 없도록 RLS가 한 번 더 막는다.
- 전체 리그의 비공개 규칙(친구가 아니면 숨김)은 `quest_global_league(viewer)` 함수가 강제한다. 사용자별 JWT가 없는 구조(인증은 n8n 담당)라서 행 단위 사용자 구분은 함수 인자로 한다.

## n8n 쪽 규칙

- 시간 컬럼은 `timestamptz`. 기존 JS 로직이 ISO 문자열 비교를 하므로 읽을 때 `quest_iso(created_at)`로 돌려준다. `date`는 `::text`.
- `jsonb` 컬럼(`stats`, 파티 `members`/`invites`)은 `::text`로 내려 기존 `JSON.parse` 코드를 그대로 쓴다.
- 쿼리 값은 반드시 Postgres 노드의 Query Parameters(`$1`, `$2`…)로 넘긴다. 문자열을 SQL에 직접 이어 붙이지 않는다.
