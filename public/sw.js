const CACHE = "rankae-static-v7";
const STATIC = ["/offline", "/rankae-icon.svg", "/rankae-icon-transparent.svg", "/rankae-wordmark.svg", "/rankae-logo-completa.svg", "/rankae-pwa-192.png", "/rankae-pwa-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("rankae-static-") && key !== CACHE).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  if (typeof data.title !== "string" || typeof data.body !== "string" ||
      typeof data.tag !== "string" || typeof data.url !== "string" ||
      !/^\/app\/rankas\/[a-f0-9-]{36}\/jogo\?etapa=partida$/.test(data.url)) return;
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag,
    icon: "/rankae-pwa-192.png",
    renotify: Boolean(data.alert),
    silent: data.alert ? undefined : true,
    data: { url: data.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  const path = event.notification.data?.url;
  event.notification.close();
  if (!path) return;
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const target = windows.find((client) => client.url === url.href);
    return target ? target.focus() : self.clients.openWindow(url.href);
  }));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline", { cacheName: CACHE })));
    return;
  }

  // Only versioned build assets and known public images may be served from disk.
  const buildAsset = url.pathname.startsWith("/_next/static/") && ["style", "script", "font"].includes(request.destination);
  const brandImage = request.destination === "image" && STATIC.includes(url.pathname) && url.pathname !== "/offline";
  if (!buildAsset && !brandImage) return;

  const asset = caches.match(request, { cacheName: CACHE }).catch(() => undefined).then(async (cached) => {
    if (cached) return { response: cached };
    const response = await fetch(request);
    if (response.status !== 200 || response.redirected || /\b(?:private|no-store)\b/i.test(response.headers.get("cache-control") ?? "")) return { response };
    const copy = response.clone();
    return { response, saved: caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined) };
  });
  event.respondWith(asset.then(({ response }) => response));
  event.waitUntil(asset.then(({ saved }) => saved, () => undefined));
});
