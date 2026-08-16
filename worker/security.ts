import { secureHeaders } from "hono/secure-headers";
import type { MiddlewareHandler } from "hono";

export const MAX_JSON_BYTES = {
  login: 2_048,
  advise: 2_048,
  day: 32_768,
  pantry: 16_384,
  loads: 65_536,
  plan: 512_000,
} as const;

const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_ATTEMPTS = 8;

const productionHeaders = secureHeaders({
  xFrameOptions: "DENY",
  referrerPolicy: "no-referrer",
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
    imgSrc: ["'self'", "data:"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    connectSrc: ["'self'"],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
  },
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
  },
});

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  const host = new URL(c.req.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    await next();
    c.header("X-Frame-Options", "DENY");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    return;
  }
  return productionHeaders(c, next);
};

export const noStoreApi: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
};

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")?.trim() || "local";
}

export function isSameOrigin(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin) return origin === url.origin;
  const referer = request.headers.get("Referer");
  if (!referer) return true;
  try {
    return new URL(referer).origin === url.origin;
  } catch {
    return false;
  }
}

export const requireSameOrigin: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !isSameOrigin(c.req.raw)) {
    return c.json({ error: "Origen no permitido." }, 403);
  }
  return next();
};

export async function readJson(
  request: Request,
  maxBytes: number,
): Promise<unknown | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  } catch {
    return null;
  }
}

export async function loginAllowed(kv: KVNamespace, ip: string): Promise<boolean> {
  const count = Number((await kv.get(rateKey(ip))) ?? "0");
  return count < LOGIN_MAX_ATTEMPTS;
}

export async function rememberLoginFailure(kv: KVNamespace, ip: string): Promise<void> {
  const key = rateKey(ip);
  const count = Number((await kv.get(key)) ?? "0") + 1;
  await kv.put(key, String(count), { expirationTtl: LOGIN_WINDOW_SECONDS });
}

export async function clearLoginFailures(kv: KVNamespace, ip: string): Promise<void> {
  await kv.delete(rateKey(ip));
}

function rateKey(ip: string): string {
  return `rl:login:${ip.slice(0, 64)}`;
}
