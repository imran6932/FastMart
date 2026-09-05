/**
 * FastMart Rider Service Worker
 * Shows push notifications for new batch assignments and other order events.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch { payload = { title: 'FastMart Rider', body: event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'FastMart Rider', {
      body: payload.body || '',
      icon: '/vite.svg',
      data: payload.data || {},
      vibrate: [200, 100, 200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const orderId = event.notification.data?.order_id
  const url = orderId ? `/orders/${orderId}` : '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) { c.focus(); c.navigate(url); return } }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
