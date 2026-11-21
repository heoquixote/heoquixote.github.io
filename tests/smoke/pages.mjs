/* 스모크 테스트 대상 페이지와 "제대로 그려졌다"의 기준.
 * expect: [선택자, 최소 개수]. 개수가 모자라면 실패 (에러 없이 빈 화면도 잡기 위함)
 * monitor: monitor.js가 로드됐는지 확인할 페이지
 * consoleErrors: false면 콘솔 에러는 보지 않고 잡히지 않은 예외(pageerror)만 실패로 침 (로그인 앱처럼 API를 막고 여는 경우)
 * liveOnly: 실제 도메인에서만 검사 (다른 저장소가 서빙하는 하위 경로)
 * 섹션을 추가하거나 선택자를 바꾸면 이 표와 각 페이지 monitor.js의 data-expect를 함께 고칩니다.
 */
export const PAGES = [
  {
    path: '/', name: '메인',
    monitor: true,
    expect: [
      ['#courseGrid .course-card', 4],
      ['.method-step', 3],
      ['#impact .outcome', 3],
      ['#bookShelf .shelf-item', 5],
      ['#career .career-item', 5],
      ['#career .partner-logo', 5],
      ['#reviewGrid .rv-card', 5],
      ['#faq details', 3],
      ['#inquiry form, #inquiry [data-open-inquiry]', 1],
    ],
  },
  { path: '/dashboard/', name: '웹 대시보드', monitor: true, expect: [['.stage iframe', 1]] },
  {
    path: '/kti/', name: '한반도 긴장도 지수', monitor: true,
    expect: [['#c-trend svg', 1], ['#c-domains svg', 1], ['#ev-body tr', 1]],
    // 수치 타일이 기본값(—)에 머물러 있으면 데이터 로딩 실패
    textNot: [['#t-kti', '—']],
  },
  { path: '/privacy/', name: '개인정보처리방침', monitor: true, expect: [['main h1', 1]] },
  { path: '/quest/', name: 'Learners Quest', consoleErrors: false, expect: [['body', 1]] },
  { path: '/interview-log/', name: '면담 로그', consoleErrors: false, expect: [['body', 1]] },
  { path: '/runners-buildup/', name: '러너즈 빌드업', liveOnly: true, consoleErrors: false, minText: 200 },
  { path: '/kdt-monitoring/', name: 'KDT 모니터링', liveOnly: true, consoleErrors: false, minText: 100 },
];

/* 실패로 치지 않는 요청·콘솔 메시지 */
export const IGNORE_URL = [
  /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/,
  /\/favicon\.ico$/,
];
export const IGNORE_CONSOLE = [
  /Failed to load resource/i, // HTTP 실패는 응답 상태로 따로 잡는다 (어떤 URL인지 남기기 위해)
  /WebGL|GPU stall|GL_|swiftshader/i, // 헤드리스 GPU 경고
];
