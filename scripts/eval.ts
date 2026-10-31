// Behavioural evaluation: runs real scenarios through the ADK runner (live TfL data, Gemini on Vertex AI)
// and checks the rules that matter, not exact wording. Needs the dev server for the MCP endpoint.
//
//   set -a; source .env.local; set +a; npx tsx scripts/eval.ts
import { getFunctionCalls, getFunctionResponses } from "@google/adk";
import { APP_NAME, runner } from "../src/lib/agent";
import type { Plan } from "../src/lib/plan-types";

type Trace = { calls: { agent: string; name: string; args: Record<string, unknown> }[]; responses: { name: string; response: unknown }[]; plan?: Plan; text: string; seconds: number };
type Check = [label: string, pass: boolean];
type Scenario = { name: string; message: string; checks: (t: Trace) => Check[] };

const called = (t: Trace, name: string) => t.calls.filter((c) => c.name === name);
const steps = (p?: Plan) => (p?.options ?? []).flatMap((o) => o.steps);
const firstOption = (p?: Plan) => p?.options[0];

const SCENARIOS: Scenario[] = [
  {
    name: "Lee, trains cancelled by wind",
    message: "I'm at Lee station. Staff say all trains are cancelled because of the wind. I need to be at Encode Hub (N1 6DA) within 90 minutes.",
    checks: (t) => [
      ["records the report against southeastern", called(t, "report_disruption").some((c) => JSON.stringify(c.args).toLowerCase().includes("southeastern"))],
      ["scans stations with southeastern down", called(t, "nearby_stations").some((c) => JSON.stringify(c.args.avoid_lines ?? []).includes("southeastern"))],
      ["transit and hub scouts ran", ["transit_scout", "hub_scout"].every((a) => t.calls.some((c) => c.agent === a))],
      ["no taxi all the way", !(t.plan?.options ?? []).some((o) => o.steps.length > 0 && o.steps.every((s) => /taxi|cab|walk/i.test(s.mode)))],
      ["presents a plan with at least two options", (t.plan?.options.length ?? 0) >= 2],
      ["Plan A avoids National Rail (weather)", !(firstOption(t.plan)?.steps ?? []).some((s) => /national-rail/i.test(s.mode))],
      ["no step rides Southeastern", !steps(t.plan).some((s) => /southeastern/i.test(s.text))],
      ["insight names an escape hub", /lewisham|blackheath|greenwich|hither green/i.test(t.plan?.insight ?? "")],
    ],
  },
  {
    name: "Remembers 'no taxis'",
    message: "Lewisham DLR is closed because of a police incident. I need to get to Canary Wharf. I never take taxis, remember that.",
    checks: (t) => [
      ["remember_preference called", called(t, "remember_preference").length > 0],
      ["presents a plan", Boolean(t.plan)],
      ["no option uses a taxi", !steps(t.plan).some((s) => /taxi|cab|uber|minicab/i.test(`${s.mode} ${s.text}`))],
      ["no step rides the DLR from Lewisham", !steps(t.plan).some((s) => /dlr/i.test(s.mode) && /lewisham/i.test(s.text))],
    ],
  },
  {
    name: "Driver: crash ahead on the A2",
    message: "I'm driving on Shooters Hill Road in Blackheath, heading to the O2. A lorry has crashed just ahead and blocked both lanes. I need to be at the O2 in 40 minutes.",
    checks: (t) => [
      ["road scout asked for routes around the incident", called(t, "drive_routes").some((c) => c.args.incident_lat !== undefined)],
      ["official road feed checked", called(t, "road_disruptions").length > 0],
      ["no public transport planned for a driver", called(t, "plan_journey").length === 0],
      ["presents a driving plan", (firstOption(t.plan)?.steps ?? []).some((s) => /drive|car/i.test(s.mode))],
    ],
  },
  {
    name: "Asks when the destination is missing",
    message: "Trains at Lee are cancelled. What do I do?",
    checks: (t) => [
      ["does not present a plan", !t.plan],
      ["asks a question", /\?/.test(t.text)],
      ["scouts did not plan journeys", called(t, "plan_journey").length === 0],
    ],
  },
];

async function run(s: Scenario): Promise<Trace> {
  const userId = `eval-${Math.random().toString(36).slice(2, 10)}`;
  const sessionId = `${userId}-session`;
  await runner.sessionService.getOrCreateSession({ appName: APP_NAME, userId, sessionId });
  const t: Trace = { calls: [], responses: [], text: "", seconds: 0 };
  const started = Date.now();
  for await (const ev of runner.runAsync({ userId, sessionId, newMessage: { role: "user", parts: [{ text: s.message }] } })) {
    for (const c of getFunctionCalls(ev)) {
      if (c.name === "present_plan") t.plan = c.args as unknown as Plan;
      t.calls.push({ agent: ev.author ?? "", name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> });
    }
    for (const r of getFunctionResponses(ev)) t.responses.push({ name: r.name ?? "", response: r.response });
    if (ev.author === "presenter") t.text += (ev.content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join("");
  }
  t.seconds = (Date.now() - started) / 1000;
  return t;
}

(async () => {
  console.log(`Plan B evaluation: ${SCENARIOS.length} scenarios, run in parallel\n`);
  const results = await Promise.all(SCENARIOS.map(async (s) => ({ s, t: await run(s).catch((e) => e as Error) })));
  let passed = 0;
  let total = 0;
  for (const { s, t } of results) {
    if (t instanceof Error) {
      console.log(`✗ ${s.name}: crashed: ${t.message}`);
      total += 1;
      continue;
    }
    const checks = s.checks(t);
    const ok = checks.filter(([, p]) => p).length;
    passed += ok;
    total += checks.length;
    console.log(`${ok === checks.length ? "✓" : "✗"} ${s.name}  (${ok}/${checks.length}, ${t.seconds.toFixed(0)} s, ${t.calls.length} tool calls)`);
    for (const [label, pass] of checks) console.log(`    ${pass ? "pass" : "FAIL"}  ${label}`);
  }
  console.log(`\n${passed}/${total} checks passed`);
  process.exit(passed === total ? 0 : 1);
})();
