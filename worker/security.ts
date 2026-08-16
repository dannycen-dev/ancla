import { secureHeaders } from "hono/secure-headers";
import type { MiddlewareHandler } from "hono";

export const MAX_JSON_BYTES = {
  login: 2_048,
  advise: 2_048,
  day: 32_768,
  pantry: 16_384,
  loads: 200_000,
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
  const site = request.headers.get("Sec-Fetch-Site");
  if (site === "cross-site") return false;
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      return origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }
  return site === "same-origin" || site === "none";
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
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  } catch {
    return null;
  }
}

export async function loginAllowed(kv: KVNamespace, ip: string): Promise<boolean> {
  return takeRateSlot(kv, rateKey(ip, "login"), LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
}

export async function clearLoginFailures(kv: KVNamespace, ip: string): Promise<void> {
  await kv.delete(rateKey(ip, "login"));
}

export async function adviseAllowed(kv: KVNamespace, ip: string): Promise<boolean> {
  return takeRateSlot(kv, rateKey(ip, "advise"), 20, LOGIN_WINDOW_SECONDS);
}

export async function writeAllowed(kv: KVNamespace, ip: string): Promise<boolean> {
  return takeRateSlot(kv, rateKey(ip, "write"), 180, 60);
}

async function takeRateSlot(
  kv: KVNamespace,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const count = Number((await kv.get(key)) ?? "0");
  if (!Number.isFinite(count) || count >= max) return false;
  await kv.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return true;
}

function rateKey(ip: string, kind: string): string {
  return `rl:${kind}:${ip.slice(0, 64)}`;
}
