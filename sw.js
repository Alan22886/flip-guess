const scope = new URL(self.registration.scope);
const cachePrefix = `flip-guess:${scope.pathname}:`;
const cacheName = cachePrefix + 'BUILD_VERSION';
const resources = /* BUILD_RESOURCES */ [];
if (!resources.length) throw new Error('Build the app before serving the worker');
const appURL = new URL('index.html', scope).href;
const assetURLs = new Set(resources.map(([path]) => new URL(path, scope).href));

self.addEventListener('install', event => {
  // Keep the active release while any of its pages are open.
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    try {
      await cache.addAll(resources.map(([path, integrity]) =>
        new Request(new URL(path, scope), { cache: 'reload', integrity })));
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(cachePrefix) && name !== cacheName)
      .map(name => caches.delete(name)));
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;
  const entry = request.mode === 'navigate' &&
    (url.pathname === scope.pathname || url.pathname === new URL(appURL).pathname);
  if (!entry && !assetURLs.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(entry ? appURL : request)) || fetch(request);
  })());
});
