/* Web push only. No caching of API data. Tapping a push opens the coin_url that came from links.py. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: 'Grok Bot · now', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Grok Bot · now', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || null }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url;
  if (url) e.waitUntil(self.clients.openWindow(url));
});
