# CLAUDE.md

데이터 러너즈(Data Learners) 홈페이지 저장소. GitHub Pages 사용자 사이트이며 커스텀 도메인 https://www.data-learners.com 으로 서빙된다. 빌드 단계 없음: main에 머지되면 그대로 배포된다.

## 작업 규칙

- main에 직접 push 금지. `claude/<작업명>` 브랜치에서 작업하고 PR을 연다. 머지는 소유자가 직접 한다.
- PR 하나에 기능 하나. 제목은 `<영역>: <변경 요약>` 형식 (예: `Runner Quest: 보스 HP 표시 개선`).
- 사용자에게 보이는 문구는 모두 한국어. em dash(—)는 쓰지 않는다.
- 외부 라이브러리는 CDN으로만 불러온다. 번들러·패키지 매니저를 추가하지 않는다.
- `CNAME`, `.nojekyll`은 건드리지 않는다.

## 디렉터리 구조

| 경로 | 내용 | 공개 범위 | 백엔드 |
|---|---|---|---|
| `index.html` | 메인 랜딩 페이지 (약 250KB 단일 파일, HTML·CSS·JS 인라인) | 공개 | 없음 |
| `analytics.js`, `hero3d.js` | 메인 페이지용 분석 스크립트, 히어로 3D 효과 | 공개 | 없음 |
| `interview-log/` | 튜터용 면담 로그 앱 | 튜터 전용 | n8n `Data Learners 면담 로그 앱` |
| `invest/` | 투자 대시보드 **빌드 결과물** | 소유자 전용 | n8n `[Data Learners] 투자 대시보드 API` |
| `quest/` | Runner Quest 자기육성 루틴 (PWA, `sw.js`, `manifest.webmanifest`) | 소유자·친구 | n8n `[Data Learners] 자기육성 퀘스트 API` (`dl/quest`), data table `quest_logs`, `quest_config` |
| `kti/` | 한반도 긴장도 지수 대시보드 | 공개 | GitHub Actions 수집 |
| `privacy/` | 개인정보처리방침 | 공개 | 없음 |
| `assets/` | 이미지, 로고, 도서 표지, 기업소개서 PDF | 공개 | 없음 |
| `llms.txt`, `sitemap.xml`, `robots.txt` | 검색·LLM 크롤러용 메타 | 공개 | 없음 |

n8n API 기본 주소: `https://hote.app.n8n.cloud/webhook/dl/` (각 앱 HTML 안에 상수로 들어 있음).

## 영역별 주의사항

### invest/
- 직접 수정하지 않는다. 원본은 `heoquixote/invest-dashboard` 저장소다.
- 갱신 절차: invest-dashboard에서 `npm run build:site` → 생성된 `dist/` 내용으로 이 저장소의 `invest/`를 통째로 교체.

### kti/
- `kti/data/kti.json`은 `.github/workflows/kti-collect.yml`이 매일 07:17 KST에 `kti/collector/collect.py`로 갱신해 커밋한다. 손으로 수정하지 않는다.
- 사람이 편집하는 파일은 `kti/data/events.csv`, `kti/data/schedule.csv`뿐이다. 이 두 파일이나 `kti/collector/**`가 main에 반영되면 수집 워크플로우가 자동 실행된다.

### quest/
- 서비스워커(`sw.js`)가 캐시를 잡으므로 정적 파일을 바꾸면 `sw.js`의 `VERSION` 상수도 함께 올린다. 안 올리면 설치된 앱에 이전 파일이 계속 뜬다.
- 로그인(패스키), 푸시 알림, 친구 기능은 n8n API와 짝을 이룬다. 요청·응답 형식을 바꿀 때는 PR 본문에 n8n 워크플로우 쪽 수정이 필요한지 명시한다.

### 개인 데이터
- 소유자 전용 앱의 실제 데이터(투자 내역, 면담 기록, 루틴 기록)는 n8n data table에만 있다. 저장소에 데이터, 토큰, 테스트용 실데이터를 커밋하지 않는다.

## 새 페이지를 추가할 때

1. 하위 폴더에 `index.html` 생성 (`<title>`은 `<페이지명> | 데이터 러너즈` 형식)
2. 메인 `index.html` 상단 바로가기 메뉴에 링크 추가 (공개 페이지인 경우)
3. 공개 페이지면 `sitemap.xml` 갱신
4. `README.md`의 연결된 사이트 표에 한 줄 추가

## 관련 저장소

- `heoquixote/invest-dashboard`: `invest/` 원본
- `heoquixote/runners-buildup`, `heoquixote/kdt-monitoring`: 같은 도메인 하위 경로로 서빙되는 별도 프로젝트 사이트 (이 저장소에서 수정하지 않음)
