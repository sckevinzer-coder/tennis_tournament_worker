// Step 24: PWA 서비스 워커
// - 설치 조건(등록된 서비스 워커 + fetch 핸들러)만 충족하기 위한 최소 구현
// - 캐시는 의도적으로 사용하지 않는다: 배포 직후 새 번들이 즉시 반영되도록 항상 네트워크 우선
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
