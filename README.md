# 데이터 러너즈

SQL, Python, Tableau, 통계, AI 자동화를 실무 프로젝트로 배우는 데이터 교육 사이트.

- 사이트: https://www.data-learners.com/

## 연결된 사이트

| 메뉴 | 주소 | 출처 |
|---|---|---|
| 위키독스 | https://data-learners.wikidocs.net/ | 외부 |
| 러너즈빌드업 | https://www.data-learners.com/runners-buildup/ | `heoquixote/runners-buildup` 저장소의 Pages |
| 웹 대시보드 | https://www.data-learners.com/dashboard/ | 이 저장소의 `dashboard/` (상단 탭으로 KDT 모니터링, 한반도 긴장도 지수를 iframe으로 전환. `#kdt`, `#kti`로 바로 열기) |
| KDT 모니터링 | https://www.data-learners.com/kdt-monitoring/ | `heoquixote/kdt-monitoring` 저장소의 Pages |
| 기업소개서 | `/assets/data-learners-brochure.pdf` | 이 저장소 |
| 면담 로그 | https://www.data-learners.com/interview-log/ | 이 저장소의 `interview-log/` (튜터 전용, API는 n8n 워크플로우 `Data Learners 면담 로그 앱`) |
| Learners Quest (자기육성 루틴) | https://www.data-learners.com/quest/ | 이 저장소의 `quest/` (소유자 전용, 루틴 체크·XP/레벨·통계. API는 n8n 워크플로우 `[Data Learners] 자기육성 퀘스트 API` (`dl/quest`), 데이터는 n8n data table `quest_logs`(기록 1건=1행), `quest_config`(루틴 정의)) |
| 한반도 긴장도 지수 | https://www.data-learners.com/kti/ | 이 저장소의 `kti/` (공개, 데이터는 `.github/workflows/kti-collect.yml`이 매일 07:17 KST에 `kti/collector/collect.py`로 수집해 `kti/data/kti.json`에 커밋. 북한 군사 이벤트는 `kti/data/events.csv`를 직접 편집) |

하위 경로는 이 저장소가 계정의 사용자 사이트(`heoquixote.github.io`)이기 때문에 GitHub Pages가 같은 계정의 프로젝트 사이트를 커스텀 도메인 아래에 자동으로 서빙하는 방식입니다. 기업소개서를 바꿀 때는 같은 파일명으로 덮어쓰면 됩니다.

## 사이트 모니터링 (에러 탐지·알림·자동 수정)

에러가 나도 화면만 비고 아무도 모르는 문제를 잡기 위한 3단계 구조입니다.

| 단계 | 무엇이 | 언제 | 결과 |
|---|---|---|---|
| ① 스모크 테스트 | `tests/smoke/smoke.mjs` (Playwright, `.github/workflows/site-smoke.yml`) | PR마다(로컬 서버), 3시간마다·배포 직후(실제 도메인) | JS 예외·콘솔 에러·리소스 4xx/5xx·핵심 영역 요소 개수 검사, 데스크톱·모바일 스크린샷을 Actions 아티팩트로 저장 |
| ② 방문자 에러 수집 | `monitor.js` (공개 페이지 `<head>` 맨 위) → n8n `[Data Learners] 사이트 에러 모니터` (`dl/site-error`) | 실제 방문자 브라우저에서 에러가 날 때 | 지문으로 중복 제거해 n8n data table `site_errors`에 기록, 처음 보거나 24시간 지난 에러만 Discord 알림 |
| ③ 이슈·자동 수정 | 이슈 라벨 `bug:site-error` → `.github/workflows/claude-fix.yml` | 스모크 실패 이슈는 즉시, 방문자 에러 이슈는 `claude-fix` 라벨 또는 `@claude` 댓글 | Claude가 재현·수정하고 스모크 테스트로 검증한 PR을 연다 (머지는 소유자) |

- 로컬 실행: `python3 -m http.server 8080` 후 `node tests/smoke/smoke.mjs` (Playwright 필요: `npm i --no-save playwright && npx playwright install chromium`). 실제 사이트는 `node tests/smoke/smoke.mjs https://www.data-learners.com`
- 섹션을 추가하거나 선택자를 바꾸면 `tests/smoke/pages.mjs`의 기준과 해당 페이지 `monitor.js` 태그의 `data-expect`를 함께 고칩니다.
- `monitor.js`는 공식 도메인에서만 보내고, 내부 트래픽(`?dl_internal=1`)과 자동화 브라우저는 제외합니다. 다른 호스트에서 확인할 때는 `?dl_monitor=1`을 붙이면 콘솔에 출력하고 전송합니다.
- 자동 수정에 필요한 저장소 Secrets: `ANTHROPIC_API_KEY` 또는 `CLAUDE_CODE_OAUTH_TOKEN` 중 하나.
