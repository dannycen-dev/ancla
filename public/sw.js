const CACHE = "ancla-shell-v9";
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

function shouldBypass(url) {
  return (
    isBustPage(url) ||
    url.searchParams.has("fresh") ||
    url.pathname === "/actualizar.js" ||
    url.pathname === "/sw.js"
  );
}

function isAppHtml(html) {
  return html.includes('id="root"') && !/Bajando la versi[oó]n/i.test(html);
}

function looksLikeAsset(url, response) {
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".js")) {
    return type.includes("javascript") || type.includes("ecmascript");
  }
  if (url.pathname.endsWith(".css")) return type.includes("css");
  if (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg")
  ) {
    return type.includes("image") || type.includes("svg");
  }
  if (url.pathname.endsWith(".webmanifest")) return type.includes("json") || type.includes("manifest");
  return !type.includes("text/html");
}

async function storeShell(response) {
  const html = await response.clone().text();
  if (!isAppHtml(html)) return;
  const cache = await caches.open(CACHE);
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  const body = new Response(html, { status: response.status, statusText: response.statusText, headers });
  await cache.put("/", body.clone());
  await cache.put("/index.html", body.clone());
  await Promise.all(
    assetUrlsFromHtml(html).map(async (assetUrl) => {
      try {
        const asset = await fetch(assetUrl, { cache: "reload" });
        if (asset.ok && looksLikeAsset(new URL(assetUrl, self.location.origin), asset)) {
          await cache.put(assetUrl, asset);
        }
      } catch {
        /* Un asset suelto no debe bloquear el HTML. */
      }
    }),
  );
}

async function precacheShell() {
  const cache = await caches.open(CACHE);
  await cache.addAll(PRECACHE.filter((path) => path !== "/"));
  try {
    const index = await fetch("/", { cache: "reload" });
    if (!index.ok) return;
    await storeShell(index);
  } catch {
    /* Instalación sin red: se usa lo que ya había. */
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
  if (isBustPage(url) || url.searchParams.has("fresh")) return false;
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
  if (shouldBypass(url)) return;

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
          const fresh = await fetch(url.href, { cache: "reload" });
          if (fresh.ok && isAppShell(url)) {
            event.waitUntil(storeShell(fresh));
          }
          return fresh;
        } catch {
          if (cached) return cached;
          return Response.error();
        }
      }
      try {
        const fresh = await fetch(url.href, { cache: "reload" });
        if (fresh.ok && shouldCache(url) && looksLikeAsset(url, fresh)) {
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
