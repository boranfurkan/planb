// Live London transport data: TfL Unified API, postcodes.io, OpenStreetMap (Nominatim, OSRM).
// Every function returns small, model-friendly objects. No keys needed; TFL_APP_KEY raises TfL's rate limit.

const TFL = "https://api.tfl.gov.uk";
const UA = "PlanB-hackathon/0.1 (GDG London Agentic Hackathon)";

export const PUBLIC_MODES = ["national-rail", "elizabeth-line", "overground", "tube", "dlr", "bus", "tram", "walking"];

// Short cache: parallel scouts often ask TfL the same question within seconds.
const cache = new Map<string, { at: number; data: Promise<unknown> }>();
const CACHE_MS = 60_000;

async function getJson<T = unknown>(url: string, init?: RequestInit, ttlMs = CACHE_MS): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as Promise<T>;
  const data = fetchJson<T>(url, init);
  cache.set(url, { at: Date.now(), data });
  data.catch(() => cache.delete(url));
  return data;
}

async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(35_000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

function tflUrl(path: string, params: Record<string, string | undefined> = {}) {
  const u = new URL(TFL + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, v);
  if (process.env.TFL_APP_KEY) u.searchParams.set("app_key", process.env.TFL_APP_KEY);
  return u.toString();
}

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- places ----------

export type Place = { name: string; lat: number; lon: number; source: string };

const KNOWN: Record<string, Place> = {
  "encode hub": { name: "Encode Hub, 41 Pitfield St, London N1 6DA", lat: 51.5287, lon: -0.0838, source: "known" },
};

const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

const COORDS = /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/;

export async function findPlace(query: string): Promise<Place[]> {
  const q = query.trim();

  // The traveller's own GPS position ("51.4497, 0.0135"): name it with a reverse lookup.
  const c = COORDS.exec(q);
  if (c) {
    const lat = Number(c[1]);
    const lon = Number(c[2]);
    try {
      const r = await getJson<{ display_name?: string; address?: Record<string, string> }>(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lon}`,
      );
      const a = r.address ?? {};
      const name = [a.road, a.suburb ?? a.neighbourhood ?? a.town].filter(Boolean).join(", ") || r.display_name?.split(",").slice(0, 2).join(",");
      return [{ name: `Your location: ${name ?? "current position"}`, lat, lon, source: "gps" }];
    } catch {
      return [{ name: "Your location", lat, lon, source: "gps" }];
    }
  }
  for (const [k, p] of Object.entries(KNOWN)) if (q.toLowerCase().includes(k)) return [p];

  const pc = q.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0];
  if (pc && POSTCODE.test(pc)) {
    try {
      const r = await getJson<{ result: { latitude: number; longitude: number; admin_district: string } }>(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`,
      );
      return [{ name: `${pc.toUpperCase()} (${r.result.admin_district})`, lat: r.result.latitude, lon: r.result.longitude, source: "postcodes.io" }];
    } catch {
      /* fall through */
    }
  }

  // Stations first: TfL knows every station's exact position.
  const stationish = /\b(station|stn|dlr|underground|overground|rail)\b/i.test(q);
  if (stationish) {
    const name = q.replace(/\b(station|stn|rail|london)\b/gi, "").trim();
    try {
      const r = await getJson<{ matches: { name: string; lat: number; lon: number }[] }>(
        tflUrl(`/StopPoint/Search/${encodeURIComponent(name)}`, { modes: "national-rail,dlr,tube,overground,elizabeth-line", maxResults: "10" }),
      );
      const exact = r.matches.filter((m) => m.name.toLowerCase().startsWith(name.toLowerCase() + " "));
      const pick = (exact.length ? exact : r.matches).slice(0, 3);
      if (pick.length) return pick.map((m) => ({ name: m.name, lat: m.lat, lon: m.lon, source: "tfl" }));
    } catch {
      /* fall through */
    }
  }

  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("q", /london/i.test(q) ? q : `${q}, London`);
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("limit", "3");
  u.searchParams.set("countrycodes", "gb");
  const r = await getJson<{ display_name: string; lat: string; lon: string }[]>(u.toString());
  return r.map((x) => ({ name: x.display_name.split(",").slice(0, 4).join(","), lat: Number(x.lat), lon: Number(x.lon), source: "openstreetmap" }));
}

// ---------- stations and hubs ----------

type StopPoint = {
  id: string;
  commonName: string;
  lat: number;
  lon: number;
  distance: number;
  modes: string[];
  hubNaptanCode?: string;
  lines: { id: string; name: string }[];
};

export type Station = {
  name: string;
  stopIds: string[];
  hub?: string;
  lat: number;
  lon: number;
  distanceKm: number;
  modes: string[];
  lines: string[];
  workingLines: string[];
  affected: boolean;
};

/** Stations near a point, grouped into interchanges, marking which ones only have lines the traveller says are broken. */
export async function nearbyStations(lat: number, lon: number, radiusM = 3000, avoidLines: string[] = []): Promise<{
  nearestAny: Omit<Station, "stopIds">[];
  escapeHubs: Station[];
}> {
  // Station positions do not change: cache by ~100 m grid cell for an hour (TfL's radius search takes 6-12 s).
  const RAIL = new Set(["national-rail", "dlr", "overground", "tube", "elizabeth-line", "tram"]);
  const r = await getJson<{ stopPoints: StopPoint[] }>(
    tflUrl("/StopPoint", {
      lat: lat.toFixed(3),
      lon: lon.toFixed(3),
      stopTypes: "NaptanRailStation,NaptanMetroStation",
      radius: String(Math.min(Math.max(Math.round(radiusM / 500) * 500, 500), 4000)),
    }),
    undefined,
    3600_000,
  );
  r.stopPoints = r.stopPoints.filter((s) => s.modes.some((m) => RAIL.has(m)));
  const avoid = new Set(avoidLines.map((l) => l.toLowerCase()));
  const groups = new Map<string, StopPoint[]>();
  for (const s of r.stopPoints) {
    const key = s.hubNaptanCode || s.commonName.replace(/ (Rail|DLR|Underground|Overground|ELL Rail) Station$/i, "");
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const stations: Station[] = [...groups.entries()].map(([key, ss]) => {
    const lines = [...new Set(ss.flatMap((s) => s.lines.map((l) => l.id)))];
    const nearest = ss.reduce((a, b) => (a.distance < b.distance ? a : b));
    const workingLines = lines.filter((l) => !avoid.has(l));
    return {
      name: ss.length > 1 ? `${key.startsWith("HUB") ? nearest.commonName.replace(/ (Rail|DLR|Underground) Station$/i, "") : key} (interchange)` : nearest.commonName,
      stopIds: ss.map((s) => s.id),
      hub: nearest.hubNaptanCode,
      lat: nearest.lat,
      lon: nearest.lon,
      distanceKm: round(nearest.distance / 1000, 2),
      modes: [...new Set(ss.flatMap((s) => s.modes))],
      lines,
      workingLines,
      affected: workingLines.length === 0,
    };
  });
  stations.sort((a, b) => a.distanceKm - b.distanceKm);
  const escapeHubs = stations
    .filter((s) => !s.affected)
    .map((s) => ({ s, score: s.workingLines.length * 2 + s.modes.length - s.distanceKm }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.s)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const nearestAny = stations.slice(0, 5).map((s) => ({
    name: s.name,
    hub: s.hub,
    lat: round(s.lat, 5),
    lon: round(s.lon, 5),
    distanceKm: s.distanceKm,
    modes: s.modes,
    lines: s.lines,
    workingLines: s.workingLines,
    affected: s.affected,
  }));
  return { nearestAny, escapeHubs: escapeHubs.slice(0, 3) };
}

// ---------- live status ----------

export async function lineStatus(lineIds: string[]) {
  const ids = [...new Set(lineIds.map((l) => l.toLowerCase().trim()).filter(Boolean))];
  if (!ids.length) return [];
  const r = await getJson<{ id: string; name: string; lineStatuses: { statusSeverityDescription: string; reason?: string }[] }[]>(
    tflUrl(`/Line/${ids.map(encodeURIComponent).join(",")}/Status`),
  );
  return r.map((l) => ({
    line: l.id,
    name: l.name,
    status: [...new Set(l.lineStatuses.map((s) => s.statusSeverityDescription))].join(", "),
    details: l.lineStatuses.map((s) => s.reason).filter(Boolean).join(" | ").slice(0, 400) || undefined,
  }));
}

export async function arrivals(stopId: string, limit = 8) {
  const r = await getJson<{ lineName: string; destinationName?: string; towards?: string; platformName?: string; timeToStation: number }[]>(
    tflUrl(`/StopPoint/${encodeURIComponent(stopId)}/Arrivals`),
  );
  return r
    .sort((a, b) => a.timeToStation - b.timeToStation)
    .slice(0, limit)
    .map((a) => ({
      line: a.lineName,
      to: a.destinationName || a.towards,
      platform: a.platformName,
      inMinutes: Math.round(a.timeToStation / 60),
    }));
}

// ---------- journeys ----------

type Leg = {
  duration: number;
  departureTime: string;
  arrivalTime: string;
  mode: { id: string };
  instruction: { summary: string };
  departurePoint: { commonName?: string };
  arrivalPoint: { commonName?: string };
  routeOptions?: { name: string; lineIdentifier?: { id: string } }[];
  isDisrupted?: boolean;
  disruptions?: { description?: string; summary?: string }[];
};

const hhmm = (iso: string) => iso.slice(11, 16);

export async function planJourney(opts: {
  from: string;
  to: string;
  avoidModes?: string[];
  avoidLines?: string[];
  date?: string;
  time?: string;
  timeIs?: "Departing" | "Arriving";
}) {
  const avoidModes = new Set((opts.avoidModes ?? []).map((m) => m.toLowerCase()));
  const avoidLines = new Set((opts.avoidLines ?? []).map((l) => l.toLowerCase()));
  const first = await journeysOnce(opts, avoidModes, avoidLines);
  // TfL returns only ~3 journeys; if every one rode an avoided National Rail operator, ask again without National Rail.
  if (!first.journeys.length && [...avoidLines].some((l) => NATIONAL_RAIL.has(l)) && !avoidModes.has("national-rail")) {
    const second = await journeysOnce(opts, new Set([...avoidModes, "national-rail"]), avoidLines);
    if (second.journeys.length) return { ...second, note: "Every rail option used an avoided operator, so these skip National Rail." };
  }
  return first;
}

const NATIONAL_RAIL = new Set([
  "southeastern", "thameslink", "southern", "c2c", "greater-anglia", "great-northern", "south-western-railway",
  "great-western-railway", "chiltern-railways", "gatwick-express", "heathrow-express", "london-northwestern-railway",
  "west-midlands-trains", "east-midlands-railway", "avanti-west-coast", "lner", "london-north-eastern-railway",
]);

async function journeysOnce(
  opts: { from: string; to: string; date?: string; time?: string; timeIs?: "Departing" | "Arriving" },
  avoidModes: Set<string>,
  avoidLines: Set<string>,
) {
  const modes = PUBLIC_MODES.filter((m) => !avoidModes.has(m));
  const r = await getJson<{ journeys?: { duration: number; startDateTime: string; arrivalDateTime: string; legs: Leg[] }[] }>(
    tflUrl(`/Journey/JourneyResults/${encodeURIComponent(opts.from)}/to/${encodeURIComponent(opts.to)}`, {
      mode: modes.join(","),
      date: opts.date?.replace(/-/g, ""),
      time: opts.time?.replace(":", ""),
      timeIs: opts.time ? opts.timeIs ?? "Departing" : undefined,
      alternativeWalking: "false",
    }),
  );
  const journeys = (r.journeys ?? [])
    .filter((j) =>
      j.legs.every((l) => !(l.routeOptions ?? []).some((o) => avoidLines.has((o.lineIdentifier?.id ?? o.name ?? "").toLowerCase()))),
    )
    .slice(0, 3)
    .map((j) => ({
      minutes: j.duration,
      leave: hhmm(j.startDateTime),
      arrive: hhmm(j.arrivalDateTime),
      legs: j.legs.map((l) => ({
        mode: l.mode.id,
        text: l.instruction.summary,
        from: l.departurePoint.commonName,
        to: l.arrivalPoint.commonName,
        departs: hhmm(l.departureTime),
        minutes: l.duration,
        lines: (l.routeOptions ?? []).map((o) => o.lineIdentifier?.id ?? o.name).filter(Boolean),
        disruption: l.isDisrupted ? (l.disruptions?.[0]?.description ?? "").slice(0, 160) || "disrupted" : undefined,
      })),
    }));
  return { journeys, note: journeys.length ? undefined : "No journeys found with those restrictions." };
}

// ---------- taxi ----------

/** Road time and a rough minicab fare. OSRM gives the road route; the fare is an estimate, not a quote. */
export async function taxiEstimate(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  let km = haversineKm(from, to) * 1.35;
  let driveMin = (km / 18) * 60;
  let source = "estimate from straight-line distance";
  try {
    const r = await getJson<{ routes: { distance: number; duration: number }[] }>(
      `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`,
    );
    if (r.routes?.[0]) {
      km = r.routes[0].distance / 1000;
      driveMin = Math.max((r.routes[0].duration / 60) * 1.6, driveMin * 0.6); // London traffic is slower than free-flow
      source = "OpenStreetMap road route, adjusted for London traffic";
    }
  } catch {
    /* keep the estimate */
  }
  const pickupWait = 5;
  const fare = 2.5 + 1.25 * km + 0.3 * driveMin;
  return {
    roadKm: round(km, 1),
    driveMinutes: Math.round(driveMin),
    pickupWaitMinutes: pickupWait,
    totalMinutes: Math.round(driveMin + pickupWait),
    fareGBP: `£${Math.round(fare * 0.85)}–£${Math.round(fare * 1.25)}`,
    source,
  };
}
