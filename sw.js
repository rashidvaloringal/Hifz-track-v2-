const CACHE_VERSION = 'alhalaqah-v2';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const DATA_CACHE  = CACHE_VERSION + '-data';
const AUDIO_CACHE = CACHE_VERSION + '-audio';

const SHELL_ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];
const DATA_ASSETS = ['./qpcv1-35.csv','./indpak-20.csv','./word.csv','./DigitalKhattIndoPak.otf','./DigitalKhattQuranic.otf'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shellCache = await caches.open(SHELL_CACHE);
    try { await shellCache.addAll(SHELL_ASSETS); } catch (e) {}
    const dataCache = await caches.open(DATA_CACHE);
    await Promise.all(DATA_ASSETS.map(async (url) => {
      try { const res = await fetch(url, { cache: 'no-cache' }); if (res.ok) await dataCache.put(url, res); } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  if (url.hostname.includes('everyayah.com')) { event.respondWith(cacheFirst(request, AUDIO_CACHE)); return; }
  if (url.pathname.endsWith('.csv') || url.pathname.endsWith('.otf') || url.pathname.endsWith('.woff') || url.pathname.endsWith('.woff2') ||
      url.hostname.includes('qurancdn.com') || url.hostname.includes('quran.foundation')) {
    event.respondWith(cacheFirst(request, DATA_CACHE)); return;
  }
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE)); return;
  }
  if (url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html') ||
      url.pathname.endsWith('manifest.json') || url.pathname.endsWith('icon.svg')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE)); return;
  }
  event.respondWith(networkFirst(request, SHELL_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.status === 200 && res.type !== 'opaque') cache.put(request, res.clone()).catch(()=>{});
    return res;
  } catch (err) {
    if (request.mode === 'navigate') {
      const shell = await caches.open(SHELL_CACHE);
      const fallback = await shell.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.status === 200 && res.type === 'basic') cache.put(request, res.clone()).catch(()=>{});
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await caches.open(SHELL_CACHE);
      const fallback = await shell.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});