// Ledger service worker — minimal app-shell + push handler.
// Cache-first for the navigation shell, network-first for everything else.

const CACHE_NAME = "ledger-shell-v1";
const SHELL_URLS = ["/dashboard", "/manifest.webmanifest", "/logo.png"];

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
    icon: "/logo.png",
    badge: "/logo.png",
    data: payload.data ?? {},
    tag: payload.data?.alertId ?? undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.alertId
    ? "/notifications"
    : "/dashboard";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      }),
  );
});
