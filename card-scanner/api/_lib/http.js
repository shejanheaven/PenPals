import { createHash, timingSafeEqual } from "node:crypto";

export class HttpError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function json(data, { status = 200, cache = "no-store", headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      ...headers,
    },
  });
}

export function errorJson(status, message, extra = {}) {
  return json({ error: message, ...extra }, { status });
}

/** Cache successful card/price lookups at the Vercel edge for a few hours. */
export const PRICE_CACHE = "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400";

export async function fetchJson(url, { headers = {}, method = "GET", body, timeoutMs = 12000 } = {}) {
  const res = await fetch(url, {
    method,
    body,
    headers: { accept: "application/json", "user-agent": "card-scanner/1.0", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message || data.error_description)) || `HTTP ${res.status}`;
    throw new HttpError(res.status, `${new URL(url).host}: ${msg}`, data);
  }
  if (data === null) throw new HttpError(502, `${new URL(url).host}: invalid JSON response`);
  return data;
}

const sha = (s) => createHash("sha256").update(String(s)).digest();

/**
 * When APP_PASSCODE is set, every request that costs money must carry the same
 * value in the x-app-passcode header. Returns an error Response, or null if OK.
 */
export function checkPasscode(request) {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return null;
  const given = request.headers.get("x-app-passcode") || "";
  if (timingSafeEqual(sha(given), sha(expected))) return null;
  return errorJson(401, "Wrong or missing passcode. Enter it in Settings.", { code: "passcode" });
}

export function queryOf(request) {
  return new URL(request.url).searchParams;
}

export function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,€\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Positive price or null (APIs use 0 / "0.00" to mean "no data"). */
export function price(v) {
  const n = toNumber(v);
  return n !== null && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function withTimeout(promise, ms, label = "operation") {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(504, `${label} timed out`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Wrap a route so thrown HttpErrors become JSON error responses. */
export function route(fn) {
  return async (request) => {
    try {
      return await fn(request);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e?.name === "TimeoutError" ? 504 : 500;
      if (status >= 500) console.error(e);
      const message = e instanceof HttpError ? e.message : e?.name === "TimeoutError" ? "Upstream request timed out" : "Server error";
      return errorJson(status, message);
    }
  };
}
