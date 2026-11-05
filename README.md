# 데이터 러너즈

SQL, Python, Tableau, 통계, AI 자동화를 실무 프로젝트로 배우는 데이터 교육 사이트.

- 사이트: https://www.data-learners.com/

## 연결된 사이트

| 메뉴 | 주소 | 출처 |
|---|---|---|
| 위키독스 | https://data-learners.wikidocs.net/ | 외부 |
| 러너즈빌드업 | https://www.data-learners.com/runners-buildup/ | `heoquixote/runners-buildup` 저장소의 Pages |
| KDT 모니터링 | https://www.data-learners.com/kdt-monitoring/ | `heoquixote/kdt-monitoring` 저장소의 Pages |
| 기업소개서 | `/assets/data-learners-brochure.pdf` | 이 저장소 |
| 면담 로그 | https://www.data-learners.com/interview-log/ | 이 저장소의 `interview-log/` (튜터 전용, API는 n8n 워크플로우 `Data Learners 면담 로그 앱`) |
| Runner Quest (자기육성 루틴) | https://www.data-learners.com/quest/ | 이 저장소의 `quest/` (소유자 전용, 루틴 체크·XP/레벨·통계. API는 n8n 워크플로우 `[Data Learners] 자기육성 퀘스트 API` (`dl/quest`), 데이터는 n8n data table `quest_logs`(기록 1건=1행), `quest_config`(루틴 정의)) |
| 한반도 긴장도 지수 | https://www.data-learners.com/kti/ | 이 저장소의 `kti/` (공개, 데이터는 `.github/workflows/kti-collect.yml`이 매일 07:17 KST에 `kti/collector/collect.py`로 수집해 `kti/data/kti.json`에 커밋. 북한 군사 이벤트는 `kti/data/events.csv`를 직접 편집) |

하위 경로는 이 저장소가 계정의 사용자 사이트(`heoquixote.github.io`)이기 때문에 GitHub Pages가 같은 계정의 프로젝트 사이트를 커스텀 도메인 아래에 자동으로 서빙하는 방식입니다. 기업소개서를 바꿀 때는 같은 파일명으로 덮어쓰면 됩니다.
