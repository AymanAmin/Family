const CACHE_VERSION = 'sila-region-v1'
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

function appUrl(path = '') {
  return new URL(path, self.registration.scope).toString()
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll([
        appUrl('./'),
        appUrl('manifest.webmanifest'),
        appUrl('icons/icon-192.png'),
        appUrl('icons/icon-512.png'),
        appUrl('icons/maskable-512.png'),
        appUrl('icons/apple-touch-icon.png'),
      ]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION && key !== RUNTIME_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(async () => {
          return (await caches.match(request)) || (await caches.match(appUrl('./'))) || Response.error()
        }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response
        const copy = response.clone()
        void caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
        return response
      })
    }),
  )
})
