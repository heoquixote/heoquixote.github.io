/* Runner Quest 서비스 워커: 앱 껍데기만 캐시하고, 기록 API(n8n)는 항상 네트워크로 보냅니다. */
var VERSION = 'rq-v2';
var SHELL = [
  '/quest/',
  '/quest/manifest.webmanifest',
  '/quest/logo.svg',
  '/quest/icon-180.png',
  '/quest/icon-192.png',
  '/quest/icon-512.png',
  '/quest/icon-maskable-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function putCache(req, res) {
  if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
    var copy = res.clone();
    caches.open(VERSION).then(function (c) { c.put(req, copy); });
  }
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.hostname.indexOf('n8n.cloud') >= 0) return;

  // 페이지 이동: 네트워크 우선(항상 최신 버전), 오프라인이면 캐시된 앱 화면
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok && url.pathname === '/quest/') { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put('/quest/', copy); }); }
      return res;
    }).catch(function () { return caches.match('/quest/'); }));
    return;
  }

  // 아이콘·차트·폰트: 캐시 우선 + 뒤에서 갱신
  var sameScope = url.origin === location.origin && url.pathname.indexOf('/quest/') === 0;
  var cdn = /(^|\.)(jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (!sameScope && !cdn) return;
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) { return putCache(req, res); }).catch(function () { return hit; });
    return hit || net;
  }));
});
