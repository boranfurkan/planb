// A public demo spends trial credit, so each visitor gets a few runs per window.
// Process-wide on purpose; keyed by client IP, never by anything a request can spoof beyond that.

const WINDOW_MS = 10 * 60_000;
const MAX_RUNS = 8;
const hits = new Map<string, number[]>();

export function isRateLimited(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_RUNS) return true;
  hits.set(ip, [...recent, now]);
  return false;
}
