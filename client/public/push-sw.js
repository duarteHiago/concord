// Notificação push do Concord (carregado pelo service worker do app, ver vite.config.ts → workbox.importScripts).
// O servidor manda { title, body, tag, icon, target } (ver server/src/push.ts). Quem desenha a notificação é o
// sistema: no iPhone ela sai igual à de qualquer app (ícone do Concord, nome, hora); no Android, com a foto de quem
// mandou e o balão do Concord na barra de status. Uma conversa por notificação: a nova substitui a anterior.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Concord';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      // mensagem nova na mesma conversa: troca a notificação e avisa de novo (som/vibração do sistema)
      renotify: !!data.tag,
      icon: data.icon || '/icon-192.png',
      badge: '/badge-96.png',
      timestamp: Date.now(),
      data: { target: data.target || null },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.target;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // o Concord já está aberto (em segundo plano): traz para a frente e abre a conversa
      const win = wins.find((w) => 'focus' in w);
      if (win) {
        await win.focus();
        win.postMessage({ type: 'concord:open', target });
        return;
      }
      // fechado: abre o app já na conversa
      await self.clients.openWindow(`/?abrir=${encodeURIComponent(JSON.stringify(target || {}))}`);
    })(),
  );
});
