const CACHE_VERSION = 'sila-v20'
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

function appUrl(path = '') {
  return new URL(path, self.registration.scope).toString()
}

const PRECACHE_PATHS = [
  './',
  'manifest.webmanifest',
  'icons/icon-approved-v4-192.jpg',
  'icons/icon-approved-v4-512.jpg',
  'icons/maskable-approved-v4-512.jpg',
  'icons/apple-touch-icon-approved-v4.jpg',
  'icons/notification-badge.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(PRECACHE_PATHS.map(async (path) => {
        try {
          await cache.add(appUrl(path))
        } catch (error) {
          console.warn('[Sila SW] Optional precache skipped:', path, error)
        }
      })))
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

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'صلة'
  const options = {
    body: data.body || 'لديك تحديث جديد في صلة.',
    icon: data.icon ? new URL(data.icon, self.registration.scope).toString() : appUrl('icons/icon-approved-v4-192.jpg'),
    badge: data.badge ? new URL(data.badge, self.registration.scope).toString() : appUrl('icons/notification-badge.png'),
    tag: data.tag || 'sila-update',
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    data: {
      url: data.url || appUrl('./#/account'),
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || appUrl('./#/account'), self.registration.scope).toString()

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(targetUrl)
        return client.focus()
      }
    }
    return self.clients.openWindow(targetUrl)
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin) return

  if (requestUrl.pathname.toLowerCase().endsWith('.apk')) {
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
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

  const isBrandAsset = requestUrl.pathname.includes('/brand/') || requestUrl.pathname.includes('/icons/') || requestUrl.pathname.endsWith('/manifest.webmanifest')
  if (isBrandAsset) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const copy = response.clone()
            void caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => (await caches.match(request)) || Response.error()),
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
