/**
 * FastMart Customer Service Worker
 *
 * Handles two events:
 *  push            — receives a push notification from the server (pywebpush)
 *                    and shows it via the Notifications API, even when the
 *                    browser tab is closed.
 *  notificationclick — focuses/opens the app to the relevant order page
 *                      when the user taps the notification.
 *
 * Service workers run in a separate context from the page — no access to
 * React state, localStorage, or the DOM. They communicate with the page via
 * postMessage() if needed, but for notifications we only need the push event.
 *
 * Interview note on why service workers are required for push:
 *   Push notifications are delivered by the browser's push service (e.g. FCM
 *   for Chrome, Mozilla Push for Firefox). When the push arrives, the browser
 *   wakes the service worker even if no tab is open. The service worker must
 *   call showNotification() within the push event — if it doesn't, the browser
 *   shows a generic "This site has been updated in the background" message.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'FastMart', body: event.data.text() }
  }

  const options = {
    body: payload.body || '',
    icon: '/vite.svg',
    badge: '/vite.svg',
    data: payload.data || {},
    vibrate: [200, 100, 200],
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'FastMart', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const orderId = event.notification.data?.order_id
  const url = orderId ? `/orders/${orderId}` : '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Otherwise open a new window.
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
