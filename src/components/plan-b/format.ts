// Turns raw tool calls and agent outputs into short, human-readable lines for the page.
import { parseAgentJson } from "@/lib/agent-json";
import type { LatLon, Situation } from "@/lib/plan-types";

export type ToolCall = { id: string; name: string; args: Record<string, unknown>; result?: unknown; author?: string; at: number };

export const AGENTS = {
  situation_analyst: { icon: "🧭", label: "Situation analyst", short: "Analyst", role: "Understands your report and what it knocks out" },
  transit_scout: { icon: "🚌", label: "Transit scout", short: "Transit", role: "Public transport around the problem" },
  hub_scout: { icon: "🔀", label: "Hub scout", short: "Hub", role: "Quick hop to an interchange that still works" },
  taxi_scout: { icon: "🚕", label: "Taxi scout", short: "Taxi", role: "Door to door, the fallback" },
  verifier: { icon: "✅", label: "Verifier", short: "Verifier", role: "Live-checks every line, re-plans what fails" },
  presenter: { icon: "🗂️", label: "Presenter", short: "Presenter", role: "Ranks and explains" },
} as const;
export type AgentName = keyof typeof AGENTS;
export const SCOUTS: AgentName[] = ["transit_scout", "hub_scout", "taxi_scout"];

export const TOOL_ICON: Record<string, string> = {
  find_place: "📍",
  nearby_stations: "🚉",
  line_status: "🚦",
  plan_journey: "🗺️",
  taxi_estimate: "🚕",
  next_departures: "⏱️",
  report_disruption: "📣",
  recent_reports: "👥",
  exit_loop: "🏁",
};

export const MODE_ICON: Record<string, string> = {
  walk: "🚶",
  walking: "🚶",
  bus: "🚌",
  taxi: "🚕",
  dlr: "🚈",
  tube: "🚇",
  overground: "🚆",
  "elizabeth-line": "🚆",
  "national-rail": "🚆",
  tram: "🚊",
};

const COORD = /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/;
const STATION_SUFFIX = / \(interchange\)| Rail Station| DLR Station| Underground Station/g;

/** Tool results arrive as JSON strings, sometimes wrapping MCP content blocks. */
export function unwrap(v: unknown): unknown {
  let x = v;
  for (let i = 0; i < 4; i++) {
    if (typeof x === "string") {
      try {
        x = JSON.parse(x);
        continue;
      } catch {
        return x;
      }
    }
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const first = Array.isArray(o.content) ? (o.content[0] as { text?: string } | undefined) : undefined;
      if (first?.text) {
        x = first.text;
        continue;
      }
      if ("result" in o && Object.keys(o).length === 1) {
        x = o.result;
        continue;
      }
    }
    return x;
  }
  return x;
}

export const shortStation = (name: string) => name.replace(STATION_SUFFIX, "");

function placeName(coord: unknown, known: LatLon[]) {
  if (typeof coord !== "string") return String(coord ?? "");
  const m = COORD.exec(coord);
  if (!m) return coord;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  const hit = known.find((k) => Math.abs(k.lat - lat) < 0.002 && Math.abs(k.lon - lon) < 0.003);
  return hit ? shortStation(hit.name.split(",")[0]) : "a point on the map";
}

/** Every named point the agents have found so far: used to turn coordinates back into names. */
export function knownPlaces(calls: ToolCall[]): LatLon[] {
  const out: LatLon[] = [];
  for (const t of calls) {
    const r = unwrap(t.result);
    if (t.name === "find_place" && Array.isArray(r) && r[0]) out.push(r[0] as LatLon);
    if (t.name === "nearby_stations" && r && typeof r === "object") {
      const n = r as { escapeHubs?: LatLon[]; nearestAny?: LatLon[] };
      out.push(...(n.escapeHubs ?? []), ...(n.nearestAny ?? []));
    }
  }
  return out;
}

const list = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "");

export function describe(call: ToolCall, known: LatLon[]): { title: string; detail?: string } {
  const a = call.args ?? {};
  const r = call.result === undefined ? undefined : unwrap(call.result);
  const err = typeof r === "string" && r.startsWith("Error") ? r : undefined;
  switch (call.name) {
    case "find_place": {
      const p = Array.isArray(r) ? (r[0] as LatLon | undefined) : undefined;
      return { title: `Locating “${a.query}”`, detail: err ?? p?.name };
    }
    case "nearby_stations": {
      const n = r as { escapeHubs?: { name: string; distanceKm: number; workingLines: string[] }[]; nearestAny?: { name: string; affected: boolean }[] } | undefined;
      const hit = n?.nearestAny?.filter((s) => s.affected).map((s) => shortStation(s.name)) ?? [];
      const hubs = n?.escapeHubs?.map((h) => `${shortStation(h.name)} ${h.distanceKm} km (${h.workingLines.join(", ")})`) ?? [];
      return {
        title: `Scanning stations nearby${list(a.avoid_lines) ? ` with ${list(a.avoid_lines)} down` : ""}`,
        detail: err ?? (n ? `${hit.length ? `Also hit: ${hit.slice(0, 4).join(", ")}. ` : ""}Escape hubs: ${hubs.join(" · ") || "none"}` : undefined),
      };
    }
    case "line_status": {
      const rows = Array.isArray(r) ? (r as { name: string; status: string }[]) : undefined;
      return { title: `Live status: ${list(a.line_ids)}`, detail: err ?? rows?.map((l) => `${l.name}: ${l.status}`).join(" · ") };
    }
    case "plan_journey": {
      const j = r as { journeys?: { minutes: number; leave: string; arrive: string; legs: { mode: string; text: string }[] }[]; note?: string } | undefined;
      const best = j?.journeys?.[0];
      const avoid = [list(a.avoid_modes), list(a.avoid_lines)].filter(Boolean).join(", ");
      return {
        title: `Route ${placeName(a.from, known)} → ${placeName(a.to, known)}${avoid ? ` (no ${avoid})` : ""}`,
        detail:
          err ??
          (best
            ? `${best.minutes} min, ${best.leave}–${best.arrive}: ${best.legs
                .filter((l) => l.mode !== "walking")
                .map((l) => l.text)
                .join(", ")}`
            : j?.note),
      };
    }
    case "taxi_estimate": {
      const t = r as { totalMinutes?: number; fareGBP?: string } | undefined;
      return {
        title: `Taxi ${placeName(`${a.from_lat},${a.from_lon}`, known)} → ${placeName(`${a.to_lat},${a.to_lon}`, known)}`,
        detail: err ?? (t?.totalMinutes ? `${t.totalMinutes} min door to door, ${t.fareGBP}` : undefined),
      };
    }
    case "next_departures": {
      const rows = Array.isArray(r) ? (r as { line: string; to?: string; inMinutes: number }[]) : undefined;
      return {
        title: "Next departures at the hub",
        detail: err ?? rows?.slice(0, 3).map((d) => `${d.line} to ${shortStation(d.to ?? "")} in ${d.inMinutes} min`).join(" · "),
      };
    }
    case "report_disruption":
      return { title: `Sharing your report: ${a.where}`, detail: String(a.what ?? "") };
    case "recent_reports": {
      const rr = r as { reports?: unknown[] } | undefined;
      return { title: "Checking what other travellers reported", detail: rr?.reports ? `${rr.reports.length} recent report(s)` : undefined };
    }
    case "exit_loop":
      return { title: "Every option checked" };
    default:
      return { title: call.name, detail: typeof r === "string" ? r.slice(0, 160) : undefined };
  }
}

/** An agent's JSON conclusion, as one line. */
export function conclusion(text?: string): string | undefined {
  const o = parseAgentJson<Record<string, unknown> & Situation & { title?: string; leaveAt?: string; arriveBy?: string; cost?: string; issues?: string[]; skipped?: boolean }>(text);
  if (!o || o.skipped) return undefined;
  if (o.title) return `${o.title} · ${o.leaveAt} → ${o.arriveBy}${o.cost ? ` · ${o.cost}` : ""}`;
  if (o.origin && o.destination)
    return `${shortStation(o.origin.name)} → ${o.destination.name.split(",")[0]}${o.deadline ? ` by ${o.deadline}` : ""} · broken: ${o.broken?.lines?.join(", ") || "?"}`;
  if (Array.isArray(o.issues)) return o.issues.length ? o.issues.join(" · ") : "All lines hold up";
  if (o.question) return `Needs: ${o.question}`;
  return undefined;
}

/** Stations near the origin that the reported problem knocks out (for the map). */
export function affectedStations(calls: ToolCall[]): LatLon[] {
  for (const t of calls) {
    if (t.name !== "nearby_stations" || !Array.isArray(t.args?.avoid_lines)) continue;
    const n = unwrap(t.result) as { nearestAny?: (LatLon & { affected: boolean })[] } | undefined;
    const hit = n?.nearestAny?.filter((s) => s.affected && typeof s.lat === "number");
    if (hit?.length) return hit;
  }
  return [];
}
