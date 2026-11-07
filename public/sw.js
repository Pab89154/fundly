/* Minimal service worker so browsers treat Fundly as installable + show alerts. */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const raw = event.notification.data && event.notification.data.url
  const path = typeof raw === 'string' && raw.startsWith('/') ? raw : '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && path) {
            try {
              await client.navigate(path)
            } catch {
              /* ignore navigate failures */
            }
          }
          return
        }
      }
      if (self.clients.openWindow) {
        const base = self.registration.scope.replace(/\/$/, '')
        await self.clients.openWindow(`${base}${path}`)
      }
    })(),
  )
})
