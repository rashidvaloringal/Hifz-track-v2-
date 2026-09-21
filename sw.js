/* =====================================================
   Al-Halaqah — Service Worker
   Caches: shell, quran data, fonts, audio
   ===================================================== */

const CACHE_VERSION = 'alhalaqah-v1';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const DATA_CACHE  = CACHE_VERSION + '-data';
const AUDIO_CACHE = CACHE_VERSION + '-audio';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

const DATA_ASSETS = [
  './qpcv1-35.csv',
  './indpak-20.csv',
  './word.csv',
  './DigitalKhattIndoPak.otf',
  './DigitalKhattQuranic.otf'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing…');
  event.waitUntil((async () => {
    // Shell — strict (must succeed)
    const shellCache = await caches.open(SHELL_CACHE);
    try {
      await shellCache.addAll(SHELL_ASSETS);
      console.log('[SW] Shell cached ✅');
    } catch (e) {
      console.warn('[SW] Shell cache partial:', e);
    }

    // Data — tolerant (each file individually)
    const dataCache = await caches.open(DATA_CACHE);
    await Promise.all(
      DATA_ASSETS.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res.ok) {
            await dataCache.put(url, res);
            console.log('[SW] Cached:', url);
          }
        } catch (e) {
          console.warn('[SW] Skip (offline?):', url);
        }
      })
    );

    await self.skipWaiting();
  })());
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating…');
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => !k.startsWith(CACHE_VERSION))
        .map((k) => {
          console.log('[SW] Removing old cache:', k);
          return caches.delete(k);
        })
    );
    await self.clients.claim();
    console.log('[SW] Activated ✅');
  })());
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  // 1) Audio — cache-first (on demand)
  if (url.hostname.includes('everyayah.com') || url.hostname.includes('quranicaudio.com')) {
    event.respondWith(cacheFirst(request, AUDIO_CACHE));
    return;
  }

  // 2) Quran data / fonts / CDN — cache-first
  if (
    url.pathname.endsWith('.csv') ||
    url.pathname.endsWith('.otf') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2') ||
    url.hostname.includes('qurancdn.com') ||
    url.hostname.includes('quran.foundation') ||
    url.hostname.includes('verses.quran.foundation')
  ) {
    event.respondWith(cacheFirst(request, DATA_CACHE));
    return;
  }

  // 3) Google Fonts — cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // 4) App shell — cache-first
  if (
    url.pathname === '/' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('manifest.json') ||
    url.pathname.endsWith('icon.svg')
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // 5) Everything else — network-first
  event.respondWith(networkFirst(request, SHELL_CACHE));
});

/* ---------- STRATEGIES ---------- */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const res = await fetch(request);
    if (res && res.status === 200 && res.type !== 'opaque') {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    if (request.mode === 'navigate') {
      const shell = await caches.open(SHELL_CACHE);
      const fallback = await shell.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.status === 200 && res.type === 'basic') {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await caches.open(SHELL_CACHE);
      const fallback = await shell.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/* ---------- MESSAGE ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting requested');
    self.skipWaiting();
  }
});

/* ---------- NOTIFICATION CLICK ---------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) {
        if (c.url && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});