const CACHE = "ancla-shell-v8";
const PRECACHE = ["/", "/manifest.webmanifest", "/favicon.svg", "/apple-touch-icon.png"];

function assetUrlsFromHtml(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
}

function isAppShell(url) {
  return url.pathname === "/" || url.pathname === "/index.html";
}

function isBustPage(url) {
  return url.pathname === "/actualizar.html" || url.pathname === "/actualizar";
}

async function precacheShell() {
  const cache = await caches.open(CACHE);
  await cache.addAll(PRECACHE);
  try {
    const index = await fetch("/", { cache: "reload" });
    if (!index.ok) return;
    await cache.put("/", index.clone());
    const html = await index.text();
    await Promise.all(
      assetUrlsFromHtml(html).map(async (url) => {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response);
      }),
    );
  } catch {
    /* Instalación sin red: se usa lo que ya había en PRECACHE. */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data !== "bust") return;
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    })(),
  );
});

function shouldCache(url) {
  if (url.pathname.startsWith("/api/")) return false;
  if (isBustPage(url)) return false;
  if (url.pathname.startsWith("/assets/")) return true;
  return (
    isAppShell(url) ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const hashed = url.pathname.startsWith("/assets/");
  const navigate = request.mode === "navigate";
  const bustPage = isBustPage(url);

  event.respondWith(
    (async () => {
      if (bustPage) {
        return fetch(request, { cache: "reload" });
      }
      if (hashed) {
        const cached = await caches.match(request);
        if (cached) return cached;
      }
      if (navigate) {
        const cached = (await caches.match(request)) || (await caches.match("/"));
        try {
          const fresh = await fetch(request, { cache: "reload" });
          if (fresh.ok && isAppShell(url)) {
            const cache = await caches.open(CACHE);
            const copy = fresh.clone();
            const html = await copy.text();
            await cache.put("/", fresh.clone());
            await cache.put(request, fresh.clone());
            await Promise.all(
              assetUrlsFromHtml(html).map(async (assetUrl) => {
                const asset = await fetch(assetUrl, { cache: "reload" });
                if (asset.ok) await cache.put(assetUrl, asset);
              }),
            );
          }
          return fresh;
        } catch {
          if (cached) return cached;
          return Response.error();
        }
      }
      try {
        const fresh = await fetch(request);
        if (fresh.ok && shouldCache(url)) {
          const cache = await caches.open(CACHE);
          void cache.put(request, fresh.clone()).catch(() => undefined);
        }
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error("offline");
      }
    })(),
  );
});
