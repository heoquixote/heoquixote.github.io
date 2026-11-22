/* 사이트 스모크 테스트
 * 실행: node tests/smoke/smoke.mjs                              (로컬 서버 http://localhost:8080, 기본값)
 *       node tests/smoke/smoke.mjs https://www.data-learners.com (실제 사이트, BASE_URL 환경변수도 가능)
 * 각 페이지를 데스크톱·모바일로 열어 아래를 검사합니다.
 *  - 문서 응답 200대, 잡히지 않은 JS 예외 0건, 콘솔 에러 0건
 *  - 같은 사이트·CDN 리소스의 4xx/5xx, 로드 실패 0건
 *  - 핵심 영역 요소 개수(pages.mjs의 expect)
 * 결과: test-results/ 아래 스크린샷, results.json, summary.md. 실패가 있으면 종료 코드 1
 */
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { PAGES, IGNORE_URL, IGNORE_CONSOLE } from './pages.mjs';

const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const LIVE = !/localhost|127\.0\.0\.1/.test(BASE);
const OUT = process.env.OUT_DIR || 'test-results';
const N8N = /hote\.app\.n8n\.cloud/;

const VIEWPORTS = [
  { key: 'desktop', opts: { viewport: { width: 1440, height: 900 } } },
  { key: 'mobile', opts: { ...devices['iPhone 13'], defaultBrowserType: undefined } },
];

const short = (u) => { try { const x = new URL(u); return x.origin === new URL(BASE).origin ? x.pathname + x.search : x.host + x.pathname; } catch { return u; } };
// 다른 저장소가 서빙하는 앱. 자기 경로로 따로 검사하므로, /dashboard/ 같은 페이지가 iframe으로 품었을 때 그 안의 요청·콘솔은 세지 않는다
const OTHER_APPS = /\/(kdt-monitoring|runners-buildup)\//;
const ignoredUrl = (u) => IGNORE_URL.some((r) => r.test(u)) || (!LIVE && OTHER_APPS.test(u));
const frameUrl = (r) => { try { return r.frame().url(); } catch { return ''; } };

async function checkPage(browser, page, vp) {
  const ctx = await browser.newContext({ ...vp.opts, serviceWorkers: 'block' });
  // 로그인·데이터 API는 테스트에서 실제로 부르지 않는다 (데이터 오염·알림 방지)
  await ctx.route(N8N, (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"smoke-test"}' }));
  const tab = await ctx.newPage();
  const problems = [];
  const add = (kind, detail) => problems.push({ kind, detail: String(detail).slice(0, 400) });
  const embedded = (u) => !OTHER_APPS.test(page.path) && OTHER_APPS.test(u || '');

  tab.on('pageerror', (e) => add('JS 예외', `${e.message}${e.stack ? '\n' + e.stack.split('\n').slice(1, 4).join('\n') : ''}`));
  if (page.consoleErrors !== false) {
    tab.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (IGNORE_CONSOLE.some((r) => r.test(t))) return;
      const loc = m.location()?.url || '';
      if (loc && (ignoredUrl(loc) || embedded(loc))) return;
      add('콘솔 에러', `${t}${loc ? ` (${short(loc)}:${m.location().lineNumber})` : ''}`);
    });
    tab.on('response', (r) => {
      const u = r.url();
      if (r.status() >= 400 && !ignoredUrl(u) && !N8N.test(u) && !embedded(frameUrl(r))) add('HTTP 실패', `${r.status()} ${short(u)}`);
    });
    tab.on('requestfailed', (r) => {
      const u = r.url(), f = r.failure()?.errorText || '';
      if (ignoredUrl(u) || N8N.test(u) || embedded(frameUrl(r)) || /ERR_ABORTED/.test(f)) return;
      add('로드 실패', `${f} ${short(u)}`);
    });
  }

  const t0 = Date.now();
  let status = 0;
  try {
    const res = await tab.goto(BASE + page.path, { waitUntil: 'load', timeout: 45000 });
    status = res ? res.status() : 0;
    if (status >= 400 || !status) add('문서 응답', `HTTP ${status}`);
    // 데이터 fetch·지연 렌더링을 기다린다. 기대 요소가 나타나면 바로 넘어감
    for (const [sel] of page.expect || []) {
      await tab.waitForSelector(sel, { state: 'attached', timeout: 10000 }).catch(() => {});
    }
    await tab.waitForTimeout(1500);

    for (const [sel, min] of page.expect || []) {
      const n = await tab.locator(sel).count();
      if (n < min) add('빈 영역', `${sel}: ${n}개 (최소 ${min}개)`);
    }
    for (const [sel, bad] of page.textNot || []) {
      const t = (await tab.locator(sel).first().textContent().catch(() => '')) || '';
      if (!t.trim() || t.trim() === bad) add('데이터 미표시', `${sel}: "${t.trim()}"`);
    }
    if (page.minText) {
      const len = (await tab.locator('body').innerText().catch(() => '')).trim().length;
      if (len < page.minText) add('빈 페이지', `본문 텍스트 ${len}자 (최소 ${page.minText}자)`);
    }
    if (page.monitor && !(await tab.evaluate(() => typeof window.dlReportError === 'function'))) {
      add('에러 수집기', 'monitor.js가 로드되지 않음');
    }
  } catch (e) {
    add('페이지 열기', e.message.split('\n')[0]);
  }

  const shot = `${OUT}/screens/${(page.path.replace(/\//g, '_').replace(/^_|_$/g, '') || 'home')}-${vp.key}.png`;
  await tab.screenshot({ path: shot, fullPage: vp.key === 'desktop' }).catch(() => {});
  await ctx.close();

  // 같은 문제가 이벤트 여러 개로 들어온 경우 하나로
  const uniq = [...new Map(problems.map((p) => [p.kind + p.detail, p])).values()];
  return { path: page.path, name: page.name, viewport: vp.key, status, ms: Date.now() - t0, problems: uniq, screenshot: shot };
}

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
await mkdir(`${OUT}/screens`, { recursive: true });
const results = [];
for (const page of PAGES) {
  if (page.liveOnly && !LIVE) continue;
  for (const vp of VIEWPORTS) {
    const r = await checkPage(browser, page, vp);
    results.push(r);
    console.log(`${r.problems.length ? '✗' : '✓'} ${r.path} [${r.viewport}] ${r.ms}ms${r.problems.map((p) => `\n    - ${p.kind}: ${p.detail.split('\n')[0]}`).join('')}`);
  }
}
await browser.close();

const failed = results.filter((r) => r.problems.length);
const lines = [
  `## 사이트 스모크 테스트 ${failed.length ? `실패 ${failed.length}건` : '통과'}`,
  '',
  `- 대상: ${BASE}`,
  `- 검사: 페이지 ${new Set(results.map((r) => r.path)).size}개 × 데스크톱·모바일`,
  '',
  '| 페이지 | 화면 | 결과 |',
  '|---|---|---|',
  ...results.map((r) => `| \`${r.path}\` ${r.name} | ${r.viewport} | ${r.problems.length ? `✗ ${r.problems.length}건` : '✓'} |`),
];
if (failed.length) {
  lines.push('', '### 실패 상세', '');
  for (const r of failed) {
    lines.push(`**\`${r.path}\` (${r.viewport})**`, '', '```');
    for (const p of r.problems) lines.push(`[${p.kind}] ${p.detail}`);
    lines.push('```', '');
  }
}
await writeFile(`${OUT}/summary.md`, lines.join('\n') + '\n');
await writeFile(`${OUT}/results.json`, JSON.stringify({ base: BASE, live: LIVE, at: new Date().toISOString(), results }, null, 2));
console.log(`\n${failed.length ? `실패 ${failed.length}건` : '모두 통과'} · ${OUT}/summary.md`);
process.exit(failed.length ? 1 : 0);
