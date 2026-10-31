// Driving: routes that avoid an incident the driver reports (OSRM over OpenStreetMap), and what TfL's
// official road-disruption feed already knows near a point.

const UA = "PlanB-hackathon/0.1 (GDG London Agentic Hackathon)";
const OSRM = "https://router.project-osrm.org/route/v1/driving";
const LONDON_TRAFFIC = 1.6; // OSRM durations are free-flow; London isn't

type LatLon = { lat: number; lon: number };
type OsrmStep = { name: string; ref?: string; distance: number };
type OsrmRoute = { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { steps: OsrmStep[] }[] };

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

// Metres on a local flat projection: plenty accurate across a city.
function project(p: LatLon, lat0: number) {
  return { x: p.lon * Math.cos((lat0 * Math.PI) / 180) * 111_320, y: p.lat * 110_540 };
}

function distanceToPath(point: LatLon, path: LatLon[]) {
  const P = project(point, point.lat);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const A = project(path[i - 1], point.lat);
    const B = project(path[i], point.lat);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy)));
  }
  return best;
}

function mainRoads(route: OsrmRoute) {
  const byName = new Map<string, number>();
  for (const s of route.legs.flatMap((l) => l.steps)) {
    const name = [s.ref?.split(";")[0], s.name].filter(Boolean).join(" ").trim();
    if (name) byName.set(name, (byName.get(name) ?? 0) + s.distance);
  }
  return [...byName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n]) => n);
}

const downsample = <T,>(xs: T[], max: number) => (xs.length <= max ? xs : xs.filter((_, i) => i % Math.ceil(xs.length / max) === 0 || i === xs.length - 1));

async function osrm(points: LatLon[], alternatives: boolean) {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const r = await json<{ routes?: OsrmRoute[] }>(`${OSRM}/${coords}?alternatives=${alternatives ? 3 : "false"}&overview=full&geometries=geojson&steps=true`);
  return r.routes ?? [];
}

export type DriveRoute = {
  kind: "direct" | "detour";
  minutes: number;
  km: number;
  passesIncident: boolean;
  clearanceM: number | null;
  via: string[];
  path: [number, number][];
};

/**
 * Driving routes from `from` to `to`. With an incident, routes passing within `radiusM` of it are marked, and detours
 * are built through points either side of the incident until two clear routes are found.
 */
export async function driveRoutes(from: LatLon, to: LatLon, incident?: LatLon, radiusM = 300) {
  const toRoute = (r: OsrmRoute, kind: DriveRoute["kind"]): DriveRoute => {
    const path = r.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
    const clearance = incident ? distanceToPath(incident, path) : null;
    return {
      kind,
      minutes: Math.round((r.duration / 60) * LONDON_TRAFFIC),
      km: Math.round(r.distance / 100) / 10,
      passesIncident: clearance !== null && clearance < radiusM,
      clearanceM: clearance === null ? null : Math.round(clearance),
      via: mainRoads(r),
      path: downsample(path, 90).map((p) => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5] as [number, number]),
    };
  };

  // "Just ahead of me": an incident at the driver's own position is placed just beyond the radius along the route they are on.
  if (incident && distanceToPath(incident, [from, from]) < radiusM) {
    const first = (await osrm([from, to], false))[0];
    const path = first?.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })) ?? [];
    const ahead = path.find((p) => distanceToPath(p, [from, from]) > radiusM + 200);
    if (ahead) incident = ahead;
  }

  const direct = (await osrm([from, to], true)).map((r, i) => toRoute(r, i === 0 ? "direct" : "detour"));
  let clear = direct.filter((r) => !r.passesIncident);

  if (incident && clear.length < 2 && direct[0]?.passesIncident) {
    // Push the route out to either side of the incident, perpendicular to the direction of travel.
    const path = direct[0].path.map(([lat, lon]) => ({ lat, lon }));
    let i = 0;
    path.forEach((p, k) => {
      if (distanceToPath(incident, [p, p]) < distanceToPath(incident, [path[i], path[i]])) i = k;
    });
    const a = path[Math.max(0, i - 2)];
    const b = path[Math.min(path.length - 1, i + 2)];
    const dLat = b.lat - a.lat;
    const dLon = (b.lon - a.lon) * Math.cos((incident.lat * Math.PI) / 180);
    const norm = Math.hypot(dLat, dLon) || 1;
    const perp = { lat: -dLon / norm, lon: dLat / norm };
    const along = { lat: dLat / norm, lon: dLon / norm };
    const offset = (p: LatLon, dir: { lat: number; lon: number }, m: number) => ({
      lat: p.lat + (dir.lat * m) / 110_540,
      lon: p.lon + (dir.lon * m) / (111_320 * Math.cos((p.lat * Math.PI) / 180)),
    });
    const vias = [
      ...[700, -700, 1400, -1400].map((m) => offset(incident, perp, m)), // round the incident, either side
      ...[600, 1200].map((m) => offset(from, along, -m)), // turn back the way you came
      ...[600, -600].map((m) => offset(from, perp, m)), // side streets where you are
    ];
    const detours = await Promise.all(vias.map((v) => osrm([from, v, to], false).catch(() => [] as OsrmRoute[])));
    const fastest = direct[0].minutes;
    clear = [...clear, ...detours.flat().map((r) => toRoute(r, "detour"))]
      .filter((r) => !r.passesIncident && r.minutes < fastest * 2.5 + 10)
      .sort((x, y) => x.minutes - y.minutes);
  }

  const seen = new Set<string>();
  const routes = [...direct.filter((r) => r.passesIncident).slice(0, 1), ...clear]
    .filter((r) => {
      const key = `${r.passesIncident}|${r.via.join(",")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
  return {
    routes,
    incident: incident ? { lat: Math.round(incident.lat * 1e5) / 1e5, lon: Math.round(incident.lon * 1e5) / 1e5 } : undefined,
    note: "Minutes include typical London traffic. Routes marked passesIncident go through the reported incident.",
  };
}

type TflRoadDisruption = { point?: string; severity?: string; category?: string; location?: string; comments?: string; currentUpdate?: string };

let disruptionCache: { at: number; data: Promise<TflRoadDisruption[]> } | undefined;

/** What TfL's official road-disruption feed already shows near a point. */
export async function roadDisruptions(at: LatLon, radiusM = 1500) {
  if (!disruptionCache || Date.now() - disruptionCache.at > 120_000) {
    const key = process.env.TFL_APP_KEY ? `&app_key=${process.env.TFL_APP_KEY}` : "";
    const data = json<TflRoadDisruption[]>(`https://api.tfl.gov.uk/Road/all/Disruption?stripContent=true${key}`);
    disruptionCache = { at: Date.now(), data };
    data.catch(() => (disruptionCache = undefined));
  }
  const all = await disruptionCache.data;
  const near = all
    .map((d) => {
      const m = /\[(-?[\d.]+),(-?[\d.]+)\]/.exec(d.point ?? "");
      if (!m) return undefined;
      const p = { lat: Number(m[2]), lon: Number(m[1]) };
      return { d, distanceM: Math.round(distanceToPath(at, [p, p])) };
    })
    .filter((x): x is { d: TflRoadDisruption; distanceM: number } => Boolean(x) && x!.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 5)
    .map(({ d, distanceM }) => ({
      where: d.location,
      severity: d.severity,
      category: d.category,
      distanceM,
      details: (d.comments ?? "").slice(0, 200),
      advice: (d.currentUpdate ?? "").slice(0, 160) || undefined,
    }));
  return { officialDisruptionsNearby: near, note: near.length ? undefined : "TfL's road feed shows nothing within this radius." };
}
