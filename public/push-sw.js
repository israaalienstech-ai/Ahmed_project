// Custom Service Worker handler for Al-Muhallab Push & OS Notifications
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Al-Muhallab — تنبيه انتهاء الصلاحية',
    body: 'يرجى مراجعة سجل التنبيهات في النظام.',
    url: '/notifications',
    tag: 'asystem-expiry-alert',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      dir: 'rtl',
      lang: 'ar',
      tag: payload.tag || 'asystem-expiry-alert',
      renotify: true,
      data: { url: payload.url || '/notifications' },
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_ALERT_NOTIFICATION') {
    const payload = event.data.payload || {};
    event.waitUntil(
      self.registration.showNotification(
        payload.title || 'Al-Muhallab — تنبيه انتهاء الصلاحية',
        {
          body: payload.body || '',
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          dir: payload.dir || 'rtl',
          lang: payload.lang || 'ar',
          tag: payload.tag || 'asystem-expiry-alert',
          renotify: true,
          data: { url: payload.url || '/notifications' },
        }
      )
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl);
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
