// A public demo spends trial credit, so each visitor gets a few runs per window.
// Process-wide on purpose; keyed by client IP, never by anything a request can spoof beyond that.

const WINDOW_MS = 10 * 60_000;
const LIMITS = { chat: 8, speak: 30 } as const;
const hits = new Map<string, number[]>();

export function isRateLimited(request: Request, bucket: keyof typeof LIMITS = "chat") {
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMITS[bucket]) return true;
  hits.set(key, [...recent, now]);
  return false;
}
