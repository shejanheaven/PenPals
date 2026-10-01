import { getPasscode } from "./settings.js";

const memo = new Map(); // short-lived cache for paid/rate-limited lookups

async function call(path, { method = "GET", body, cacheMs = 0 } = {}) {
  if (cacheMs) {
    const hit = memo.get(path);
    if (hit && hit.until > Date.now()) return hit.data;
  }
  const headers = {};
  const pass = getPasscode();
  if (pass) headers["x-app-passcode"] = pass;
  if (body) headers["content-type"] = "application/json";
  let res;
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("No connection. Check your internet and try again.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  if (cacheMs) memo.set(path, { data, until: Date.now() + cacheMs });
  return data;
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();

export const api = {
  status: () => call("/api/status"),
  identify: ({ front, back, gameHint }) => call("/api/identify", { method: "POST", body: { front, back, gameHint } }),
  search: (params) => call(`/api/search?${qs(params)}`),
  card: (id) => call(`/api/card?${qs({ id })}`),
  ebay: ({ q, must, exclude, graded, grade }) =>
    call(`/api/ebay?${qs({ q, must: must?.join(","), exclude: exclude?.join(","), graded: graded ? "1" : "", grade })}`, { cacheMs: 10 * 60_000 }),
  pricecharting: (q) => call(`/api/pricecharting?${qs({ q })}`, { cacheMs: 30 * 60_000 }),
};
