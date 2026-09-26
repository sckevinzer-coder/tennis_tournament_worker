// Step 28: PWA 서비스 워커 — 푸시 알림 수신
// - 설치 조건(등록된 서비스 워커 + fetch 핸들러)만 충족하기 위한 최소 구현 유지
// - 캐시는 의도적으로 사용하지 않는다: 배포 직후 새 번들이 즉시 반영되도록 항상 네트워크 우선
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Step 28: Web Push 수신 — 앱이 닫혀 있어도 OS 레벨 알림 표시
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: '테니스 대회', body: event.data ? event.data.text() : '새 알림이 있습니다.' };
  }
  const title = data.title || '🎾 테니스 대회';
  const options = {
    body: data.body || '새 알림이 있습니다.',
    icon: '/apple-touch-icon.png',
    badge: '/favicon.svg',
    tag: data.tag || `tennis-${Date.now()}`,
    data: { url: data.url || '/', matchId: data.matchId, tournamentId: data.tournamentId },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 — 앱 열기/포커스
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          try { client.navigate(url); } catch { /* navigate 미지원 환경 무시 */ }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // 교차 출처(Worker API·Kakao SDK 등)는 브라우저 기본 동작에 맡긴다.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).catch(
      () =>
        new Response('오프라인 상태입니다. 네트워크 연결을 확인해 주세요.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
    ),
  );
});
