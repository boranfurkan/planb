// Types shared by the server stream (/api/chat) and the page. Type-only: safe to import from client components.

export type PlanStep = { mode: string; text: string; minutes?: number };

export type PlanOption = {
  label: string;
  title: string;
  leaveAt: string;
  arriveBy: string;
  totalMinutes: number;
  cost?: string;
  reliability: "high" | "medium" | "low";
  steps: PlanStep[];
  why: string;
};

export type Plan = { headline: string; understood: string; insight: string; options: PlanOption[]; warnings?: string[] };

/** One NDJSON line of /api/chat. */
export type StreamItem =
  | { type: "agent"; name: string }
  | { type: "call"; id: string; name: string; args: unknown; author?: string }
  | { type: "result"; id: string; name: string; result: unknown; author?: string }
  | { type: "output"; author: string; text: string }
  | { type: "plan"; plan: Plan }
  | { type: "text"; text: string }
  | { type: "error"; message: string }
  | { type: "done"; ms: number };

export type LatLon = { name: string; lat: number; lon: number };

/** The situation analyst's conclusion (its JSON output). */
export type Situation = {
  origin?: LatLon;
  destination?: LatLon;
  now?: string;
  deadline?: string | null;
  broken?: { lines?: string[]; stations?: string[]; cause?: string; weatherOrInfrastructure?: boolean };
  officialFeedShowsIt?: boolean;
  escapeHubs?: (LatLon & { stopIds?: string[]; workingLines?: string[]; distanceKm?: number })[];
  constraints?: string[];
  otherReports?: string[];
  question?: string;
};
