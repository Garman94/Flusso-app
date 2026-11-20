const CACHE_NAME = "flusso-v1";

// Asset statici da precachare
const PRECACHE_URLS = ["/", "/dashboard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora richieste non-GET e API/auth
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  if (url.pathname.startsWith("/_next/")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);

      // Network-first: usa cache solo se la rete fallisce
      return networkFetch || cached;
    }),
  );
});

// ── Notifiche push (Account → Avvisi, lib/push.ts) ─────────────────────────────────────
// Il server manda {title, body, url, tag}, cifrato con le chiavi di questo dispositivo.
// Ogni messaggio deve mostrare una notifica (Safari e Chrome lo pretendono).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const str = (v, fallback) => (typeof v === "string" && v ? v : fallback);
  // solo pagine di Flusso: niente indirizzi esterni
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/dashboard";
  event.waitUntil(
    self.registration.showNotification(str(data.title, "Flusso"), {
      body: str(data.body, ""),
      icon: "/android/launchericon-192x192.png",
      tag: str(data.tag, "flusso"),
      lang: "it",
      data: { url },
    }),
  );
});

// Tocco sulla notifica: se Flusso è già aperto lo porta davanti sulla pagina giusta, altrimenti lo apre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/dashboard";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of list) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          await client.focus();
          await client.navigate(target);
          return;
        } catch (e) {
          // finestra non controllata da questo service worker: se ne apre una nuova
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// Il browser ha cambiato da solo l'indirizzo delle notifiche: si iscrive di nuovo e lo dice al server.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      let sub = event.newSubscription;
      if (!sub && old && old.options && old.options.applicationServerKey) {
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: old.options.applicationServerKey,
        });
      }
      if (!sub) return;
      await fetch("/api/push/subscription", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), old: old ? old.endpoint : null }),
      });
    })().catch(() => {}),
  );
});
