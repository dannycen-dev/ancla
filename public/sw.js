const CACHE = "ancla-shell-v7";
const PRECACHE = ["/", "/manifest.webmanifest", "/favicon.svg", "/apple-touch-icon.png"];

function assetUrlsFromHtml(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
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
        const response = await fetch(url);
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
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

function shouldCache(url) {
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/assets/")) return true;
  return (
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
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

  event.respondWith(
    (async () => {
      if (hashed) {
        const cached = await caches.match(request);
        if (cached) return cached;
      }
      if (navigate) {
        const cached = (await caches.match(request)) || (await caches.match("/"));
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(CACHE);
            const copy = fresh.clone();
            const html = await copy.text();
            await cache.put("/", fresh.clone());
            await cache.put(request, fresh.clone());
            await Promise.all(
              assetUrlsFromHtml(html).map(async (url) => {
                const asset = await fetch(url);
                if (asset.ok) await cache.put(url, asset);
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
