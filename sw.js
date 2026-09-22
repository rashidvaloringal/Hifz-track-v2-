/* =====================================================
   Al-Halaqah — Service Worker (v2 — fixed routing)
   ===================================================== */

const CACHE_VERSION = 'alhalaqah-v2';
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
    const shellCache = await caches.open(SHELL_CACHE);
    await Promise.all(
      SHELL_ASSETS.map(async (url) => {
        try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) await shellCache.put(url, r); }
        catch (e) { console.warn('[SW] Skip shell:', url); }
      })
    );
    const dataCache = await caches.open(DATA_CACHE);
    await Promise.all(
      DATA_ASSETS.map(async (url) => {
        try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) await dataCache.put(url, r); }
        catch (e) { console.warn('[SW] Skip data:', url); }
      })
    );
    await self.skipWaiting();
  })());
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
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

  // Audio — cache-first (on demand)
  if (url.hostname.includes('everyayah.com') || url.hostname.includes('quranicaudio.com')) {
    event.respondWith(cacheFirst(request, AUDIO_CACHE));
    return;
  }

  // Quran data / fonts — cache-first
  if (
    url.pathname.endsWith('.csv') ||
    url.pathname.endsWith('.otf') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2') ||
    url.hostname.includes('qurancdn.com') ||
    url.hostname.includes('quran.foundation')
  ) {
    event.respondWith(cacheFirst(request, DATA_CACHE));
    return;
  }

  // Google Fonts — cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Navigation requests → try network, fallback to cached index
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // App shell assets — cache-first
  if (
    url.pathname.endsWith('manifest.json') ||
    url.pathname.endsWith('icon.svg')
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Everything else — network-first
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
    if (request.mode === 'navigate') return navigationFallback();
    return new Response('Offline', { status: 503 });
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
    if (request.mode === 'navigate') return navigationFallback();
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstNavigation(request) {
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, res.clone()).catch(() => {});
      return res;
    }
    throw new Error('Bad status');
  } catch (err) {
    return navigationFallback();
  }
}

async function navigationFallback() {
  const shell = await caches.open(SHELL_CACHE);
  // Try both '/' and './index.html'
  let cached = await shell.match('./index.html');
  if (!cached) cached = await shell.match('./');
  if (!cached) cached = await shell.match('index.html');
  if (cached) return cached;

  return new Response(
    '<!DOCTYPE html><html><body style="background:#0a0f0d;color:#e8e4dc;font-family:sans-serif;text-align:center;padding:50px;"><h1>📖 Al-Halaqah</h1><p>ഓഫ്‌ലൈൻ mode — App വീണ്ടും തുറക്കാൻ ശ്രമിക്കുന്നു…</p><button onclick="location.reload()" style="padding:12px 24px;background:#c5a059;color:#04211a;border:none;border-radius:8px;font-weight:bold;">Retry</button></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

/* ---------- MESSAGE ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- NOTIFICATION CLICK ---------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) if (c.url && 'focus' in c) return c.focus();
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});