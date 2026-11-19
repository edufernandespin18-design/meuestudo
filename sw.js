/* =========================================================
   MeuEstudo — sw.js (Service Worker)
   - Pré-cache dos arquivos estáticos essenciais (tolerante a ausentes:
     módulos ainda não entregues não impedem a instalação do SW).
   - Navegação: rede primeiro, cai para o cache quando offline.
   - Demais arquivos do mesmo site: cache primeiro, atualizando em segundo plano.
   - Não intercepta requisições de outros domínios nem não-GET.
   - Para publicar uma nova versão: AUMENTE o número em CACHE_VERSION.
   ========================================================= */

const CACHE_VERSION = 'v3';
const CACHE_NAME = `meuestudo-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/layout.css',
  './css/modules/horarios-agenda.css',
  './css/modules/notas.css',
  './css/modules/foco.css',
  './js/app.js',
  './js/storage.js',
  './js/ui.js',
  './js/modules/horarios-agenda.js',
  './js/modules/notas.js',
  './js/modules/foco.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // allSettled: um arquivo ausente (ex.: módulo ainda não entregue) não derruba a instalação.
    await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n.startsWith('meuestudo-') && n !== CACHE_NAME)
        .map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação (abrir/recarregar o app): rede primeiro, cache como reserva.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = (await caches.match('./index.html')) || (await caches.match('./'));
        if (cached) return cached;
        return new Response('Sem conexão e o app ainda não foi carregado. Abra uma vez com internet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // Arquivos estáticos: cache primeiro + atualização em segundo plano.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      network.catch(() => null);
      return cached;
    }
    const response = await network;
    return response || new Response('', { status: 504, statusText: 'Offline' });
  })());
});
