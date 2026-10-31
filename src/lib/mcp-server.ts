// "London Live" MCP server: TfL and map tools, served over Streamable HTTP at /api/mcp.
// The Plan B agent reaches every live-data tool through this server; any other MCP client can use it too.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { driveRoutes, roadDisruptions } from "./roads";
import { arrivals, findPlace, lineStatus, nearbyStations, planJourney, taxiEstimate } from "./tfl";

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const fail = (e: unknown) => ({ content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true });
const wrap =
  <A,>(f: (a: A) => Promise<unknown>) =>
  async (a: A) => {
    try {
      return ok(await f(a));
    } catch (e) {
      return fail(e);
    }
  };

export function createLondonLiveServer() {
  const server = new McpServer({ name: "london-live", version: "0.1.0" });

  server.registerTool(
    "find_place",
    {
      description:
        "Turn a place name, station name, address or UK postcode into coordinates. Returns up to 3 candidates. Include the word 'station' for stations.",
      inputSchema: { query: z.string().describe("e.g. 'Lee station', 'Encode Hub', '41 Pitfield St N1 6DA'") },
    },
    wrap(({ query }: { query: string }) => findPlace(query)),
  );

  server.registerTool(
    "nearby_stations",
    {
      description:
        "Rail, Tube, DLR, Overground and Elizabeth line stations near a point, grouped into interchanges. Lines listed in avoid_lines are treated as not running: stations with no other line are marked affected. escapeHubs are the best nearby interchanges that still have working lines.",
      inputSchema: {
        lat: z.number(),
        lon: z.number(),
        radius_m: z.number().optional().describe("Search radius in metres, default 3000, max 6000"),
        avoid_lines: z.array(z.string()).optional().describe("TfL line ids that are down, e.g. ['southeastern']"),
      },
    },
    wrap(({ lat, lon, radius_m, avoid_lines }: { lat: number; lon: number; radius_m?: number; avoid_lines?: string[] }) =>
      nearbyStations(lat, lon, radius_m ?? 3000, avoid_lines ?? []),
    ),
  );

  server.registerTool(
    "line_status",
    {
      description:
        "Live status of TfL and National Rail lines from TfL (e.g. 'southeastern', 'thameslink', 'dlr', 'northern', 'jubilee', 'elizabeth', 'windrush', or bus routes like '261'). Official feeds can lag behind what staff tell travellers.",
      inputSchema: { line_ids: z.array(z.string()) },
    },
    wrap(({ line_ids }: { line_ids: string[] }) => lineStatus(line_ids)),
  );

  server.registerTool(
    "plan_journey",
    {
      description:
        "Plan public transport journeys with the TfL Journey Planner. from/to are 'lat,lon' or a TfL stop id. avoid_modes removes whole modes (e.g. 'national-rail'); avoid_lines drops any journey that uses those lines. Returns up to 3 journeys with legs, times and live disruptions.",
      inputSchema: {
        from: z.string(),
        to: z.string(),
        avoid_modes: z.array(z.string()).optional().describe("Any of: national-rail, elizabeth-line, overground, tube, dlr, bus, tram"),
        avoid_lines: z.array(z.string()).optional(),
        date: z.string().optional().describe("YYYY-MM-DD, default today"),
        time: z.string().optional().describe("HH:MM London time, default now"),
        time_is: z.enum(["Departing", "Arriving"]).optional(),
      },
    },
    wrap(
      (a: { from: string; to: string; avoid_modes?: string[]; avoid_lines?: string[]; date?: string; time?: string; time_is?: "Departing" | "Arriving" }) =>
        planJourney({ from: a.from, to: a.to, avoidModes: a.avoid_modes, avoidLines: a.avoid_lines, date: a.date, time: a.time, timeIs: a.time_is }),
    ),
  );

  server.registerTool(
    "next_departures",
    {
      description: "Live next departures at a Tube, DLR, Overground, Elizabeth line or bus stop id (e.g. '940GZZDLLEW' for Lewisham DLR).",
      inputSchema: { stop_id: z.string() },
    },
    wrap(({ stop_id }: { stop_id: string }) => arrivals(stop_id)),
  );

  server.registerTool(
    "taxi_estimate",
    {
      description: "Road time and a rough minicab/Uber fare between two points (estimate, not a quote). Includes about 5 minutes waiting for pickup.",
      inputSchema: { from_lat: z.number(), from_lon: z.number(), to_lat: z.number(), to_lon: z.number() },
    },
    wrap(({ from_lat, from_lon, to_lat, to_lon }: { from_lat: number; from_lon: number; to_lat: number; to_lon: number }) =>
      taxiEstimate({ lat: from_lat, lon: from_lon }, { lat: to_lat, lon: to_lon }),
    ),
  );

  server.registerTool(
    "drive_routes",
    {
      description:
        "Driving routes between two points. If the driver reports an incident (crash, flooding, closure) give its position: routes passing within radius_m of it are marked passesIncident, and detours around it are built. Returns up to 3 routes with minutes (London traffic), km, main roads and clearance from the incident.",
      inputSchema: {
        from_lat: z.number(),
        from_lon: z.number(),
        to_lat: z.number(),
        to_lon: z.number(),
        incident_lat: z.number().optional(),
        incident_lon: z.number().optional(),
        radius_m: z.number().optional().describe("How close counts as going through the incident, default 150"),
      },
    },
    wrap(async (a: { from_lat: number; from_lon: number; to_lat: number; to_lon: number; incident_lat?: number; incident_lon?: number; radius_m?: number }) => {
      const incident = a.incident_lat !== undefined && a.incident_lon !== undefined ? { lat: a.incident_lat, lon: a.incident_lon } : undefined;
      return driveRoutes({ lat: a.from_lat, lon: a.from_lon }, { lat: a.to_lat, lon: a.to_lon }, incident, a.radius_m ?? 150);
    }),
  );

  server.registerTool(
    "road_disruptions",
    {
      description:
        "What TfL's official road-disruption feed already shows near a point (works, closures, collisions). Use it to tell whether the driver's report is already known to official feeds.",
      inputSchema: { lat: z.number(), lon: z.number(), radius_m: z.number().optional().describe("Default 1500") },
    },
    wrap(({ lat, lon, radius_m }: { lat: number; lon: number; radius_m?: number }) => roadDisruptions({ lat, lon }, radius_m ?? 1500)),
  );

  return server;
}
