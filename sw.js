const CACHE_VERSION = "hacker-ankit-game-3-v10";
const ROOT = new URL("./", self.registration.scope);
const BUILD_ASSETS = [];
const APP_FILES = ["./", "./index.html", "./style.css?direct", "./style.css", "./script.js", "./manifest.json", "./icon.svg", ...BUILD_ASSETS];
const CACHE_FILES = APP_FILES.map(path => new URL(path, ROOT).href);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(CACHE_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("hacker-ankit-game-3-") && key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match(new URL("./index.html", ROOT).href));
      }
    }
    if (request.destination === "style") {
      try {
        const response = await fetch(request);
        if (response.ok) {
          try { await cache.put(request, response.clone()); } catch {}
          return response;
        }
      } catch {}
      const exactStylesheet = await cache.match(request);
      return exactStylesheet || await cache.match(request, { ignoreSearch: true }) || Response.error();
    }
    const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && new URL(request.url).origin === self.location.origin) cache.put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
