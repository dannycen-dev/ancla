const COOKIE = "ancla_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return new Uint8Array(signature);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function passwordsMatch(given: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(given);
  const right = encoder.encode(expected);
  if (left.byteLength !== right.byteLength) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

const PBKDF2_ITERS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERS);
  return JSON.stringify({
    v: 1,
    salt: bytesToB64Url(salt),
    hash: bytesToB64Url(hash),
    iters: PBKDF2_ITERS,
  });
}

export async function verifyHashedPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(stored) as { salt?: unknown; hash?: unknown; iters?: unknown };
    if (typeof parsed.salt !== "string" || typeof parsed.hash !== "string") return false;
    const iterations = typeof parsed.iters === "number" && parsed.iters > 0 ? parsed.iters : PBKDF2_ITERS;
    const salt = b64UrlToBytes(parsed.salt);
    const expected = b64UrlToBytes(parsed.hash);
    const given = await pbkdf2(password, salt, iterations);
    return timingSafeEqual(given, expected);
  } catch {
    return false;
  }
}

function cookieFlags(requestUrl: string, maxAge: number): string {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createSessionCookie(secret: string, requestUrl: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const nonce = crypto.randomUUID();
  const payload = `${exp}.${nonce}`;
  const signature = bytesToB64Url(await hmac(secret, payload));
  return `${COOKIE}=${payload}.${signature}; ${cookieFlags(requestUrl, MAX_AGE_SECONDS)}`;
}

export function clearSessionCookie(requestUrl: string): string {
  return `${COOKIE}=; ${cookieFlags(requestUrl, 0)}`;
}

export async function hasValidSession(request: Request, secret: string): Promise<boolean> {
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)ancla_session=([^;]+)/);
  if (!match) return false;

  const parts = match[1].split(".");
  if (parts.length !== 3) return false;
  const [expText, nonce, signature] = parts;
  if (!expText || !nonce || !signature) return false;
  if (!/^[0-9]+$/.test(expText) || !/^[0-9a-f-]{36}$/i.test(nonce)) return false;

  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const payload = `${expText}.${nonce}`;
  const expected = await hmac(secret, payload);
  const given = b64UrlToBytes(signature);
  return timingSafeEqual(expected, given);
}
