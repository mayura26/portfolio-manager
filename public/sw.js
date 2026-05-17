// Ledger service worker — minimal app-shell + push handler.
// Cache-first for the navigation shell, network-first for everything else.

const CACHE_NAME = "ledger-shell-v2";
const NOTIFICATION_ICON = "/notification-icon.svg";
const SHELL_URLS = [
  "/dashboard",
  "/manifest.webmanifest",
  "/logo.png",
  NOTIFICATION_ICON,
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: try network, fall back to cached dashboard shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match("/dashboard")
          .then(
            (cached) =>
              cached ??
              new Response("Offline", { status: 503, statusText: "Offline" }),
          ),
      ),
    );
    return;
  }

  // Static asset requests: cache-first for known shell URLs
  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Ledger", body: event.data.text() };
  }
  const title = payload.title ?? "Ledger";
  const options = {
    body: payload.body ?? "",
    icon: payload.icon ?? NOTIFICATION_ICON,
    badge: payload.badge ?? NOTIFICATION_ICON,
    data: payload.data ?? {},
    tag:
      payload.tag ??
      payload.data?.notificationId ??
      payload.data?.alertId ??
      undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/notifications";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const targetUrl = new URL(target, self.location.origin);
        for (const client of clients) {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin !== targetUrl.origin) continue;
          if (
            "navigate" in client &&
            clientUrl.pathname !== targetUrl.pathname
          ) {
            client.navigate(targetUrl.href);
          }
          if ("focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl.href);
        }
      }),
  );
});
