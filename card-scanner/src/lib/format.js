const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function money(n, { whole = false } = {}) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return whole && Math.abs(n) >= 100 ? usd0.format(n) : usd.format(n);
}

export function pct(n) {
  return `${Math.round(n * 1000) / 10}%`;
}

export function timeAgo(ts) {
  if (!ts) return "";
  const t = typeof ts === "number" ? ts : Date.parse(String(ts).replace(/\//g, "-"));
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** Only let https links from upstream APIs into hrefs. */
export function safeHref(url) {
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
