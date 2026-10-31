// Plan B: an ADK multi-agent system that re-plans a London journey around a disruption the traveller reports
// before the official feeds know about it. Every live-data tool comes from the London Live MCP server (/api/mcp).
//
//   plan_b (SequentialAgent)
//     1. situation_analyst   understands the report, locates places, records it for others, finds escape hubs
//     2. scouts (ParallelAgent)
//          transit_scout     public transport straight from the origin, avoiding what is broken
//          hub_scout         taxi or bus hop to the best escape hub, then onward
//          taxi_scout        door to door, the fallback
//     3. verifier (LoopAgent, max 2 rounds)  live-checks every line in every option, re-plans what fails
//     4. presenter           Plan A / Plan B cards
import {
  type BaseTool,
  BasePlugin,
  type Context,
  EXIT_LOOP,
  FunctionTool,
  InMemorySessionService,
  LlmAgent,
  LoopAgent,
  MCPToolset,
  ParallelAgent,
  type ReadonlyContext,
  Runner,
  SequentialAgent,
} from "@google/adk";
import { type GenerateContentConfig, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { parseAgentJson } from "./agent-json";
import { addReport, recentReports } from "./reports";
import { lineStatus } from "./tfl";

export const MODEL = process.env.PLANB_MODEL || "gemini-3.8-flash";
// Scouts do narrow, tool-driven work: the lighter model halves their time with the same evaluation results.
const SCOUT_MODEL = process.env.PLANB_SCOUT_MODEL || "gemini-3.5-flash-lite";
export const APP_NAME = "planb";

const mcpUrl = () => process.env.MCP_URL || `http://127.0.0.1:${process.env.PORT || 3000}/api/mcp`;
const londonLive = (tools: string[]) => new MCPToolset({ type: "StreamableHTTPConnectionParams", url: mcpUrl(), timeout: 30_000 }, tools);

// Thinking is kept low: the tools do the heavy lifting, and a traveller at a closed station cannot wait minutes.
const config = (level: ThinkingLevel): GenerateContentConfig => ({
  temperature: 0.2,
  thinkingConfig: { thinkingLevel: level },
  httpOptions: { retryOptions: { attempts: 3 }, timeout: 60_000 },
});
const CONFIG = config(ThinkingLevel.LOW);

function londonNow() {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  return f.format(new Date());
}

const stateText = (ctx: ReadonlyContext, key: string) => {
  const v = ctx.state.get<unknown>(key);
  if (v === undefined || v === null || v === "") return "(none)";
  return typeof v === "string" ? v : JSON.stringify(v);
};

// ---------- community reports: what travellers saw, shared with the next person ----------

const reportDisruption = new FunctionTool({
  name: "report_disruption",
  description:
    "Record what the traveller saw (e.g. staff at Lee say trains are cancelled because of wind) so the next traveller planning through there is warned, even before official feeds update. Also locks those lines out of every plan in this conversation.",
  parameters: z.object({
    where: z.string().describe("Station or place, e.g. 'Lee station'"),
    lines: z.array(z.string()).describe("TfL line ids affected, e.g. ['southeastern']"),
    what: z.string().describe("Short description, e.g. 'All trains cancelled due to high winds (staff at the entrance)'"),
  }),
  execute: async (r, ctx?: Context) => {
    addReport(r);
    if (ctx) {
      const prev = ctx.state.get<string[]>("broken_lines") ?? [];
      ctx.state.set("broken_lines", [...new Set([...prev, ...r.lines.map((l) => l.toLowerCase())])]);
    }
    return { recorded: true, reportsLast6h: recentReports().length };
  },
});

const recentReportsTool = new FunctionTool({
  name: "recent_reports",
  description: "Disruptions other Plan B travellers reported in the last few hours. They are often ahead of official feeds.",
  parameters: z.object({ hours: z.number().optional().describe("Look-back window, default 6") }),
  execute: async ({ hours }) => ({ reports: recentReports(hours ?? 6).slice(0, 20) }),
});

// ---------- memory: lasting preferences, kept in ADK user-scoped state ("user:" keys outlive the session) ----------

const PREFS_KEY = "user:preferences";

const rememberPreference = new FunctionTool({
  name: "remember_preference",
  description:
    "Remember a lasting travel preference the traveller states, for this and future trips (e.g. 'no taxis', 'step-free only', 'budget £10', 'avoid buses').",
  parameters: z.object({ preference: z.string().describe("Short, e.g. 'no taxis' or 'step-free only'") }),
  execute: async ({ preference }, ctx?: Context) => {
    if (!ctx) return { remembered: false };
    const prefs = ctx.state.get<string[]>(PREFS_KEY) ?? [];
    const next = [...new Set([...prefs, preference.trim().toLowerCase()])].slice(-10);
    ctx.state.set(PREFS_KEY, next);
    return { remembered: true, preferences: next };
  },
});

/** Guardrail: no scout may plan through a line the traveller reported as down, even if the model forgets. */
function enforceBrokenLines({ tool, args, context }: { tool: { name: string }; args: Record<string, unknown>; context: Context }) {
  if (tool.name !== "plan_journey") return undefined;
  const broken = context.state.get<string[]>("broken_lines") ?? [];
  if (!broken.length) return undefined;
  const given = Array.isArray(args.avoid_lines) ? (args.avoid_lines as string[]) : [];
  args.avoid_lines = [...new Set([...given.map((l) => l.toLowerCase()), ...broken])];
  return undefined; // run the tool with the corrected arguments
}

// ---------- the answer card ----------

export const PlanSchema = z.object({
  headline: z.string().describe("One short line, e.g. 'Get to Lewisham: the DLR is running'"),
  understood: z.string().describe("What you understood: where they are, what is broken, where to, by when"),
  insight: z.string().describe("The key reasoning in one or two sentences, e.g. why this hub"),
  options: z
    .array(
      z.object({
        label: z.string().describe("'Plan A', 'Plan B', 'Plan C'"),
        title: z.string().describe("e.g. 'Taxi to Lewisham, then DLR + Northern line'"),
        leaveAt: z.string().describe("HH:MM"),
        arriveBy: z.string().describe("HH:MM"),
        totalMinutes: z.number(),
        cost: z.string().optional().describe("e.g. '£10–£15 taxi + Oyster fare'"),
        reliability: z.enum(["high", "medium", "low"]),
        steps: z.array(
          z.object({
            mode: z.string().describe("walk, bus, taxi, dlr, tube, overground, elizabeth-line, national-rail"),
            text: z.string(),
            minutes: z.number().optional(),
          }),
        ),
        why: z.string(),
      }),
    )
    .min(1)
    .max(3),
  warnings: z.array(z.string()).optional().describe("Live problems to watch, e.g. 'Northern line: severe delays'"),
});
export type Plan = z.infer<typeof PlanSchema>;

const presentPlan = new FunctionTool({
  name: "present_plan",
  description: "Show the traveller the recommendation as cards. Call exactly once; this ends your turn.",
  parameters: PlanSchema,
  execute: async (_plan, ctx?: Context) => {
    if (ctx) ctx.actions.skipSummarization = true; // the cards are the answer: no extra model call
    return { shown: true };
  },
});

// ---------- 1. situation analyst ----------

const situationAnalyst = new LlmAgent({
  name: "situation_analyst",
  description: "Understands the traveller's report, locates places, records the report and finds escape hubs.",
  model: MODEL,
  generateContentConfig: CONFIG,
  tools: [londonLive(["find_place", "nearby_stations", "line_status"]), reportDisruption, recentReportsTool, rememberPreference],
  outputKey: "situation",
  instruction: (ctx) => `You are the situation analyst in Plan B, a London travel agent for the moment journey apps are behind reality.
Current London time: ${londonNow()}.
What you remember about this traveller from earlier trips: ${stateText(ctx, PREFS_KEY)}. Treat these as constraints.
If they state a lasting preference now ("I never take taxis", "I use a wheelchair", "my budget is £10"), call remember_preference.

The traveller reports something the apps may not know yet, like "staff at Lee say trains are cancelled because of the wind".
Treat it as true even when official feeds say Good Service. Use the whole conversation: a follow-up like "I can't afford a taxi" changes the constraints.

Do this with tools:
1. find_place for the origin and the destination (add "station" for stations).
2. If the traveller reports a disruption: report_disruption with the lines it affects (a London suburban station like Lee is usually Southeastern;
   if unsure, call nearby_stations first). Call recent_reports at the same time.
   Call independent tools in the same turn (in parallel), e.g. both find_place calls together.
3. nearby_stations ONCE at the origin with avoid_lines = the broken lines and radius_m 3500.
   If the cause is weather, power or signalling (wind, storm, flooding, signal failure, trespass), other National Rail lines on the same stretch are at risk too:
   prefer escape hubs on a different network (DLR, Tube, Overground, Elizabeth line, tram).
4. line_status for the broken lines: note whether the official feed already shows it.

Then reply with ONLY a JSON object, no prose, no code fences:
{"origin":{"name","lat","lon"},"destination":{"name","lat","lon"},"now":"HH:MM","deadline":"HH:MM or null",
 "broken":{"lines":[],"stations":[],"cause":"","weatherOrInfrastructure":true},"officialFeedShowsIt":false,
 "escapeHubs":[{"name","lat","lon","stopIds":[],"workingLines":[],"distanceKm":0}],
 "constraints":["e.g. no taxi","budget £15","step-free"],"otherReports":["..."]}
Keep at most 2 escape hubs, the best first. If the origin or destination is missing, reply {"question":"<one short question>"} instead.`,
});

// ---------- 2. scouts ----------

const scoutPreamble = (ctx: ReadonlyContext) => `Current London time: ${londonNow()}.
The situation, as JSON: ${stateText(ctx, "situation")}
If the situation contains "question", reply only {"skipped":true}.
Never guess lines, times or fares: use tool results only. from/to for plan_journey are "lat,lon".`;

const OPTION_FORMAT = `Reply with ONLY a JSON object, no prose, no code fences:
{"kind":"...","title":"...","leaveAt":"HH:MM","arriveBy":"HH:MM","totalMinutes":0,"cost":"...","steps":[{"mode":"bus","text":"261 bus from Lee Station to Lewisham","minutes":12}],
 "linesUsed":["261","dlr"],"liveIssues":["..."],"notes":"..."}`;

const transitScout = new LlmAgent({
  name: "transit_scout",
  description: "Finds the best public transport route straight from the origin, avoiding what is broken.",
  model: SCOUT_MODEL,
  generateContentConfig: CONFIG,
  tools: [londonLive(["plan_journey", "line_status"])],
  beforeToolCallback: enforceBrokenLines,
  outputKey: "transit_option",
  instruction: (ctx) => `You are the transit scout in Plan B.
${scoutPreamble(ctx)}
Find the best public transport journey from the origin to the destination that avoids the broken lines
(plan_journey with avoid_lines = broken lines; if weatherOrInfrastructure is true, also avoid_modes ["national-rail"]).
Pick the fastest journey without disrupted legs, then line_status for its lines. ${OPTION_FORMAT}
Use "kind":"direct".`,
});

const hubScout = new LlmAgent({
  name: "hub_scout",
  description: "Gets the traveller to the best escape hub by taxi, then plans onward from there.",
  model: SCOUT_MODEL,
  generateContentConfig: CONFIG,
  tools: [londonLive(["taxi_estimate", "plan_journey", "next_departures", "line_status"])],
  beforeToolCallback: enforceBrokenLines,
  outputKey: "hub_option",
  instruction: (ctx) => `You are the hub scout in Plan B.
${scoutPreamble(ctx)}
Skip any escape hub within 0.6 km of the origin (the traveller is already there). For each remaining escape hub (at most 2), in parallel:
- taxi_estimate from the origin to the hub;
- plan_journey from the hub ("lat,lon") to the destination, departing at now + the taxi's totalMinutes (time "HH:MM"), avoiding the broken lines.
Then next_departures at the best hub's DLR, Tube or Overground stop id if it has one, and line_status for the onward lines.
If the constraints say no taxi, use plan_journey from the origin to the hub by bus instead.
Pick the hub that arrives earliest. ${OPTION_FORMAT}
Use "kind":"hub" and include the taxi fare in cost.`,
});

const taxiScout = new LlmAgent({
  name: "taxi_scout",
  description: "Prices a taxi door to door as the fallback.",
  model: SCOUT_MODEL,
  generateContentConfig: CONFIG,
  tools: [londonLive(["taxi_estimate"])],
  outputKey: "taxi_option",
  instruction: (ctx) => `You are the taxi scout in Plan B.
${scoutPreamble(ctx)}
If the constraints or remembered preferences rule out taxis, reply only {"skipped":true}.
Otherwise call taxi_estimate from the origin to the destination once. ${OPTION_FORMAT}
Use "kind":"taxi", one step, linesUsed [].`,
});

const scouts = new ParallelAgent({
  name: "scouts",
  description: "Three scouts look for different ways out at the same time.",
  subAgents: [transitScout, hubScout, taxiScout],
});

// ---------- 3. verifier ----------

/** Before the verifier thinks, fetch the live status of every line the scouts used, in code. */
async function gatherLiveStatus(ctx: Context) {
  const lines = new Set<string>();
  for (const key of ["transit_option", "hub_option", "taxi_option"]) {
    const option = parseAgentJson<{ linesUsed?: string[] }>(ctx.state.get<string>(key));
    for (const l of option?.linesUsed ?? []) lines.add(String(l).toLowerCase());
  }
  if (lines.size) {
    try {
      ctx.state.set("live_status", await lineStatus([...lines]));
    } catch (e) {
      ctx.state.set("live_status", `unavailable: ${(e as Error).message}`);
    }
  }
  return undefined;
}

const checker = new LlmAgent({
  name: "verifier",
  description: "Live-checks every line in every option and re-plans an option that fails.",
  model: MODEL,
  generateContentConfig: CONFIG,
  tools: [londonLive(["line_status", "plan_journey"]), EXIT_LOOP],
  beforeToolCallback: enforceBrokenLines,
  outputKey: "verified",
  beforeAgentCallback: gatherLiveStatus,
  instruction: (ctx) => `You are the verifier in Plan B. Current London time: ${londonNow()}.
Situation: ${stateText(ctx, "situation")}
Transit option: ${stateText(ctx, "transit_option")}
Hub option: ${stateText(ctx, "hub_option")}
Taxi option: ${stateText(ctx, "taxi_option")}
Your previous check, if any: ${stateText(ctx, "verified")}

Live status of every line the options use, fetched just now: ${stateText(ctx, "live_status")}

If the situation contains "question", call exit_loop and reply {"skipped":true}.
Otherwise judge each option against the live status (do not call line_status again for these lines):
- At risk: Suspended, or Severe Delays / Part Suspended / Part Closure that affects the section the option rides (read the details).
- Not at risk: Good Service, Minor Delays, Special Service on a bus, or a closure on a different section of the line.
Only if an option is at risk, re-plan that one option with plan_journey avoiding that line (once), and check the new lines with line_status.
Reply with ONLY a JSON object: {"options":[...the options, corrected...],"issues":["Northern line: severe delays, avoided", "..."]}, then call exit_loop.`,
});

const verifier = new LoopAgent({ name: "verify_loop", description: "Checks and re-plans until the options hold up.", subAgents: [checker], maxIterations: 2 });

// ---------- 4. presenter ----------

const presenter = new LlmAgent({
  name: "presenter",
  description: "Ranks the verified options and presents Plan A and Plan B.",
  model: MODEL,
  generateContentConfig: CONFIG,
  tools: [presentPlan],
  instruction: (ctx) => `You are the presenter in Plan B. Current London time: ${londonNow()}.
Situation: ${stateText(ctx, "situation")}
Verified options: ${stateText(ctx, "verified")}
Raw scout options, if the verifier skipped: transit ${stateText(ctx, "transit_option")} | hub ${stateText(ctx, "hub_option")} | taxi ${stateText(ctx, "taxi_option")}

If the situation contains "question", ask that question in one sentence and do not call any tool.
Otherwise rank by: arrives before the deadline, then reliability (fewer changes, no disrupted legs), then cost.
Call present_plan once with Plan A and Plan B (a Plan C only if genuinely different). The insight must name the key move,
e.g. "Every station near you is on Southeastern; Lewisham is 2.6 km away and has the DLR, which the wind doesn't affect."
Mention if the official feed doesn't show the disruption yet, and any live problems (e.g. Northern line severe delays) in warnings.
Times are London local HH:MM; taxi fares are estimates. present_plan is your whole answer.`,
});

// ---------- root ----------

export const planB = new SequentialAgent({
  name: "plan_b",
  description: "Re-plans London journeys around disruptions the traveller reports, using live TfL data.",
  subAgents: [situationAnalyst, scouts, verifier, presenter],
});

/** A tool that fails (a dropped MCP connection, a TfL timeout) is retried once; if it fails again the model gets a clear error, not a crash. */
class ToolResilience extends BasePlugin {
  constructor() {
    super("tool_resilience");
  }
  override async onToolErrorCallback({ tool, toolArgs, toolContext, error }: { tool: BaseTool; toolArgs: Record<string, unknown>; toolContext: Context; error: Error }) {
    try {
      return (await tool.runAsync({ args: toolArgs, toolContext })) as Record<string, unknown>;
    } catch {
      return { error: `${tool.name} is temporarily unavailable (${error.message.slice(0, 120)}). Retry once, or continue with what you already have.` };
    }
  }
}

// Sessions live on globalThis so they survive hot reloads; the runner is rebuilt with the current agents.
const gs = globalThis as unknown as { __planbSessions?: InMemorySessionService };
const sessionService = (gs.__planbSessions ??= new InMemorySessionService());
export const runner = new Runner({ agent: planB, appName: APP_NAME, sessionService, plugins: [new ToolResilience()] });
