/* Runner Quest 서비스 워커: 앱 껍데기만 캐시하고, 기록 API(n8n)는 항상 네트워크로 보냅니다.
   푸시 알림(저녁 9시 남은 퀘스트 등)도 여기서 받아 표시합니다. */
var VERSION = 'rq-v4';
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

// 웹 푸시: n8n 「Web Push 발송 (공용)」이 보낸 암호화 페이로드 { title, body, url, tag, icon, badge }
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  var opts = {
    body: d.body || '',
    icon: d.icon || '/quest/icon-192.png',
    badge: d.badge || '/quest/icon-192.png',
    lang: 'ko',
    data: { url: d.url || '/quest/' }
  };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  e.waitUntil(self.registration.showNotification(d.title || 'Runner Quest', opts));
});

// 알림 탭: 열린 앱이 있으면 그 창으로, 없으면 새로 엽니다.
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var path = (e.notification.data && e.notification.data.url) || '/quest/';
  if (path.indexOf('/quest/') !== 0) path = '/quest/';
  var url = self.location.origin + path;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.location.origin + '/quest/') === 0 && 'focus' in c) {
        c.postMessage({ type: 'rq-open', url: path });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
