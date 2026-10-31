"use client";
// The workspace: a glass agent panel (left) built from live agent events, the plan panel (right), a follow-up bar.
import { useEffect, useRef, useState } from "react";
import type { Plan, PlanOption, Situation } from "@/lib/plan-types";
import { AGENTS, type AgentName, describe, knownPlaces, SCOUTS } from "./format";
import type { MapData } from "./journey-map";
import { Orb } from "./orb";
import { ReadAloud } from "./read-aloud";
import type { Turn } from "./use-plan-b";

export const GLASS =
  "rounded-3xl border border-white/[0.07] bg-[rgba(14,14,17,0.72)] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[28px] backdrop-saturate-150";
const MONO_LABEL = "font-mono text-[10.5px] uppercase tracking-[0.18em]";

// ---------- live elapsed time ----------

function useElapsed(turn: Turn) {
  const [now, setNow] = useState(() => turn.startedAt);
  useEffect(() => {
    if (!turn.running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [turn.running]);
  return turn.ms != null ? turn.ms / 1000 : Math.max(0, (now - turn.startedAt) / 1000);
}

// ---------- stages from live events ----------

const STAGES: { name: string; who: string; agents: AgentName[] }[] = [
  { name: "Understanding your report", who: "Situation analyst", agents: ["situation_analyst"] },
  { name: "Scouting a way out", who: "Four scouts, in parallel", agents: SCOUTS },
  { name: "Verifying every line live", who: "Verifier loop", agents: ["verifier"] },
  { name: "Ranking your options", who: "Presenter", agents: ["presenter"] },
];

type StageState = "idle" | "active" | "done";
const skipped = (text?: string) => /"skipped"\s*:\s*true/.test(text ?? "");

function stageStates(turn: Turn): StageState[] {
  const seen = STAGES.map((s) => s.agents.some((a) => turn.agents.includes(a)));
  return STAGES.map((_, i) => {
    if (!seen[i]) return "idle";
    const later = seen.slice(i + 1).some(Boolean) || (i === 3 && Boolean(turn.plan));
    return later || !turn.running ? "done" : "active";
  });
}

function scoutChip(turn: Turn, s: AgentName, running: boolean) {
  const out = turn.outputs[s];
  if (skipped(out)) return { name: `${AGENTS[s].short} · skipped`, ink: "text-[#62646b]", dot: "bg-[#3a3b40]" };
  if (out || !running) return { name: AGENTS[s].short, ink: "text-[#c9cad0]", dot: "bg-[#5fd49a]" };
  return { name: AGENTS[s].short, ink: "text-[#c9cad0]", dot: turn.agents.includes(s) ? "bg-[#f5b24e] pb-pulse" : "bg-white/20" };
}

export function AgentPanel({ turn }: { turn: Turn }) {
  const elapsed = useElapsed(turn);
  const states = stageStates(turn);
  const known = knownPlaces(turn.calls);
  const feed = useRef<HTMLDivElement>(null);
  const count = turn.calls.length;
  useEffect(() => {
    if (turn.running && feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [count, turn.running]);

  const done = states.filter((s) => s === "done").length;
  const activeIdx = states.indexOf("active");
  const activeCalls = activeIdx >= 0 ? turn.calls.filter((c) => STAGES[activeIdx].agents.includes(c.author as AgentName)).length : 0;
  const progress = turn.running ? Math.min(98, (done + (activeIdx >= 0 ? Math.min(0.9, activeCalls / 6) : 0)) * 25) : 100;
  const last = turn.calls.at(-1);
  const question = !turn.running && !turn.plan && Boolean(turn.text);

  return (
    <aside aria-label="What the agents are doing" className={`${GLASS} flex min-h-0 flex-col overflow-hidden`}>
      <div className="flex items-center gap-3.5 px-5 pb-4 pt-[18px]">
        <Orb mode={turn.running ? "thinking" : "idle"} className="h-[52px] w-[52px] flex-none" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{turn.running ? "Plan B is thinking" : question ? "One quick question" : turn.plan ? "Plan ready" : "Stopped"}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-[#8a8d95]">
            {turn.running
              ? last
                ? `${AGENTS[last.author as AgentName]?.short ?? "Agent"} · ${describe(last, known).title}`
                : "Reading your situation…"
              : `${count} live checks · 6 agents`}
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-[#8a8d95]">{elapsed.toFixed(1)}s</span>
      </div>
      <div className="mx-5 h-px overflow-hidden bg-white/[0.06]">
        <div className="h-full bg-gradient-to-r from-[#8a7dff] to-[#f5b24e] transition-[width] duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="px-5 pb-1 pt-4">
        <p className="font-serif text-[19px] italic leading-snug text-pretty text-[#d9d9de]">“{turn.message.replace(/\n\(My location:[^)]*\)/, "")}”</p>
      </div>
      <div ref={feed} aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3.5 [scrollbar-width:none]">
        {STAGES.map((g, i) => {
          const st = states[i];
          const active = st === "active";
          const calls = turn.calls.filter((c) => g.agents.includes(c.author as AgentName));
          return (
            <div key={g.name} className="grid grid-cols-[18px_minmax(0,1fr)] gap-3.5">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-[3px] h-3 w-3 flex-none rounded-full border ${
                    st === "idle" ? "border-white/20" : active ? "border-[#f5b24e] bg-[#f5b24e] shadow-[0_0_0_4px_rgba(245,178,78,0.15),0_0_16px_#f5b24e]" : "border-[#ededf0] bg-[#ededf0]"
                  }`}
                />
                <span className={`my-1 w-px flex-1 ${i === STAGES.length - 1 ? "bg-transparent" : st === "done" ? "bg-white/20" : "bg-white/[0.07]"}`} />
              </div>
              <div className={`min-w-0 pb-[18px] ${st === "idle" ? "opacity-40" : ""}`}>
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-medium text-[#ededf0]">{g.name}</p>
                  <span className={`ml-auto font-mono text-[11px] ${active ? "text-[#f2c27b]" : "text-[#5fd49a]"}`}>{st === "idle" ? "" : active ? "working" : "done"}</span>
                </div>
                <p className="mt-0.5 text-xs text-[#7c7f87]">{g.who}</p>
                {i === 1 && st !== "idle" ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {SCOUTS.map((s) => {
                      const c = scoutChip(turn, s, turn.running);
                      return (
                        <span key={s} className={`flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[11.5px] ${c.ink}`}>
                          <span className={`h-[5px] w-[5px] rounded-full ${c.dot}`} />
                          {c.name}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-col">
                  {calls.map((c) => {
                    const d = describe(c, known);
                    return (
                      <div key={c.id} className="border-t border-white/[0.045] py-2">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="flex-none font-mono text-[10.5px] text-[#7c7f87]">{c.name}</span>
                          <span className="truncate text-[13px] text-[#dcdce0]">{d.title}</span>
                          {c.result === undefined && turn.running ? <span className="pb-pulse ml-auto h-[5px] w-[5px] flex-none rounded-full bg-[#f5b24e]" /> : null}
                        </div>
                        {d.detail ? <p className="mt-0.5 line-clamp-3 break-words text-xs leading-relaxed text-[#7c7f87]">{d.detail}</p> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ---------- the plan ----------

const MODE: Record<string, { label: string; color: string }> = {
  taxi: { label: "TAXI", color: "#f5b24e" },
  dlr: { label: "DLR", color: "#3ec9c1" },
  tube: { label: "TUBE", color: "#c9cad0" },
  walk: { label: "WALK", color: "#8a8d95" },
  walking: { label: "WALK", color: "#8a8d95" },
  bus: { label: "BUS", color: "#ff5a6e" },
  overground: { label: "OVERGROUND", color: "#ee8a3c" },
  "elizabeth-line": { label: "ELIZABETH", color: "#9b7bff" },
  "national-rail": { label: "RAIL", color: "#6aa5ff" },
  tram: { label: "TRAM", color: "#84c341" },
  drive: { label: "DRIVE", color: "#5fd49a" },
  car: { label: "DRIVE", color: "#5fd49a" },
};
const RELIABILITY: Record<PlanOption["reliability"], { label: string; color: string }> = {
  high: { label: "High reliability", color: "#5fd49a" },
  medium: { label: "Medium reliability", color: "#f5b24e" },
  low: { label: "Low reliability", color: "#ff5a6e" },
};

function addMinutes(hhmm: string, minutes: number) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return "";
  const t = (Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Hand the chosen route to Google Maps: a driving detour keeps its waypoint; a hub plan starts from the hub. */
function googleMapsUrl(option: PlanOption, situation: Situation | undefined, map: MapData) {
  const o = situation?.origin;
  const d = situation?.destination;
  if (!o || !d) return undefined;
  const ll = (p: { lat: number; lon: number }) => `${p.lat},${p.lon}`;
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("destination", ll(d));
  const driving = option.steps.some((s) => /drive|car/i.test(s.mode));
  if (driving) {
    u.searchParams.set("origin", ll(o));
    u.searchParams.set("travelmode", "driving");
    const best = map.routes.find((r) => r.best);
    const mid = best?.path[Math.floor(best.path.length / 2)];
    if (mid) u.searchParams.set("waypoints", `${mid[0]},${mid[1]}`);
  } else {
    const hub = map.hubs[0];
    const viaHub = hub && option.steps.some((s) => s.text.toLowerCase().includes(hub.name.split(" ")[0].toLowerCase()));
    u.searchParams.set("origin", ll(viaHub ? hub : o));
    u.searchParams.set("travelmode", "transit");
  }
  return u.toString();
}

function PlanSkeleton() {
  return (
    <div className="p-6">
      <p className={`${MONO_LABEL} text-[#7c7f87]`}>Your plan</p>
      <div className="mt-[18px] flex flex-col gap-2.5">
        <div className="pb-shimmer h-[22px] w-[85%] rounded-md bg-white/[0.06]" />
        <div className="pb-shimmer h-[22px] w-[60%] rounded-md bg-white/[0.06]" />
        <div className="pb-shimmer mt-3.5 h-[120px] rounded-2xl bg-white/[0.04]" />
        <div className="pb-shimmer h-[52px] rounded-xl bg-white/[0.035]" />
      </div>
      <p className="mt-[18px] text-[13px] leading-normal text-[#7c7f87]">Nothing is recommended until every line has been checked live.</p>
    </div>
  );
}

function FeedsBadge({ situation }: { situation?: Situation }) {
  if (situation?.officialFeedShowsIt === false)
    return (
      <span className="flex items-center gap-2 self-start text-xs text-[#ff9aa6]">
        <span className="pb-pulse h-1.5 w-1.5 rounded-full bg-[#ff5a6e]" />
        Ahead of the official feeds
      </span>
    );
  if (situation?.officialFeedShowsIt === true)
    return (
      <span className="flex items-center gap-2 self-start text-xs text-[#8fd3ff]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#5ab8ff]" />
        Official feeds confirm it
      </span>
    );
  return null;
}

function PlanView({ plan, turn, situation, map }: { plan: Plan; turn: Turn; situation?: Situation; map: MapData }) {
  const [tab, setTab] = useState(0);
  const o = plan.options[Math.min(tab, plan.options.length - 1)];
  const steps = o.steps.map((s, i) => {
    const before = o.steps.slice(0, i).reduce((sum, x) => sum + (x.minutes ?? 0), 0);
    return { ...s, at: addMinutes(o.leaveAt, before), m: MODE[s.mode.toLowerCase()] ?? { label: s.mode.toUpperCase(), color: "#9a9ca3" } };
  });
  const rel = RELIABILITY[o.reliability] ?? RELIABILITY.medium;
  const maps = googleMapsUrl(o, situation, map);

  return (
    <div className="flex flex-col gap-[18px] p-6">
      <FeedsBadge situation={situation} />
      <h2 className="-mt-1.5 text-[26px] font-medium leading-tight tracking-[-0.03em] text-balance">{plan.headline}</h2>
      <div className="rounded-2xl border border-[rgba(245,178,78,0.18)] bg-gradient-to-br from-[rgba(245,178,78,0.12)] to-[rgba(245,178,78,0.03)] px-4 py-3.5">
        <p className={`${MONO_LABEL} text-[#f2c27b]`}>The key move</p>
        <p className="mt-1.5 text-sm leading-normal text-pretty text-[#efe6d6]">{plan.insight}</p>
      </div>
      {plan.options.length > 1 ? (
        <div role="tablist" aria-label="Options" className="grid rounded-full border border-white/[0.06] bg-white/[0.04] p-1" style={{ gridTemplateColumns: `repeat(${plan.options.length}, 1fr)` }}>
          {plan.options.map((x, i) => (
            <button
              key={x.label + i}
              type="button"
              role="tab"
              aria-selected={i === tab}
              onClick={() => setTab(i)}
              className={`h-[34px] rounded-full text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none ${
                i === tab ? "bg-[#ededf0] text-[#0a0a0c] shadow-[0_4px_14px_rgba(0,0,0,0.4)]" : "text-[#a7a9b0] hover:text-white"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      ) : null}
      <div>
        <p className="text-[15px] text-[#dcdce0]">{o.title}</p>
        <div className="mt-2.5 flex items-baseline gap-3 font-mono tabular-nums">
          <span className="text-[42px] font-normal tracking-[-0.04em] text-white">{o.leaveAt}</span>
          <span className="text-lg text-[#62646b]" aria-hidden="true">
            →
          </span>
          <span className="text-[42px] font-normal tracking-[-0.04em] text-[#f2c27b] [text-shadow:0_0_24px_rgba(245,178,78,0.35)]">{o.arriveBy}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-[#8a8d95]">
          <span>{o.totalMinutes}&nbsp;min</span>
          {o.cost ? <span>{o.cost}</span> : null}
          <span className="flex items-center gap-1.5" style={{ color: rel.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: rel.color }} />
            {rel.label}
          </span>
        </div>
      </div>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[44px_14px_minmax(0,1fr)_auto] items-stretch gap-2.5">
            <span className="pt-px font-mono text-[11.5px] tabular-nums text-[#7c7f87]">{s.at}</span>
            <div className="flex flex-col items-center">
              <span className="mt-1 h-[9px] w-[9px] flex-none rounded-full" style={{ background: s.m.color, boxShadow: `0 0 10px ${s.m.color}` }} />
              <span className="my-[3px] w-0.5 flex-1 rounded opacity-35" style={{ background: s.m.color }} />
            </div>
            <div className="min-w-0 pb-4">
              <p className="text-sm text-[#ededf0]">{s.text}</p>
              <p className="mt-0.5 font-mono text-[10.5px] tracking-[0.1em]" style={{ color: s.m.color }}>
                {s.m.label}
              </p>
            </div>
            <span className="font-mono text-[11.5px] text-[#7c7f87]">{s.minutes != null ? `${s.minutes} min` : ""}</span>
          </li>
        ))}
      </ol>
      <p className="-mt-1.5 text-[13px] leading-relaxed text-pretty text-[#8a8d95]">{o.why}</p>
      <div className="flex gap-2">
        {maps ? (
          <a
            href={maps}
            target="_blank"
            rel="noreferrer"
            className="flex h-[46px] flex-1 items-center justify-center rounded-full bg-[#ededf0] text-sm font-medium text-[#0a0a0c] transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none"
          >
            Open in Google Maps
          </a>
        ) : null}
        <ReadAloud plan={plan} autoPlay={turn.voice} />
      </div>
      <p className="border-t border-white/[0.06] pt-3.5 text-xs text-[#7c7f87]">
        {plan.warnings?.[0] ? `${plan.warnings[0]} · ` : ""}Planned in {turn.ms != null ? (turn.ms / 1000).toFixed(1) : "…"}s
      </p>
    </div>
  );
}

export function PlanPanel({ turn, situation, map }: { turn: Turn; situation?: Situation; map: MapData }) {
  const question = !turn.running && !turn.plan && turn.text;
  return (
    <section aria-label="Your plan" className={`${GLASS} overflow-y-auto [scrollbar-width:none]`}>
      {turn.plan ? (
        <PlanView key={turn.startedAt} plan={turn.plan} turn={turn} situation={situation} map={map} />
      ) : question ? (
        <div className="p-6">
          <p className={`${MONO_LABEL} text-[#f2c27b]`}>One quick question</p>
          <p className="mt-3 text-xl leading-snug text-pretty text-white">{turn.text}</p>
          <p className="mt-3 text-[13px] text-[#7c7f87]">Answer below, by typing or with the orb.</p>
        </div>
      ) : turn.running ? (
        <PlanSkeleton />
      ) : (
        <div className="p-6">
          <p className={`${MONO_LABEL} text-[#ff9aa6]`}>Something went wrong</p>
          <p className="mt-3 text-sm text-[#dcdce0]">{turn.errors[0] ?? "No plan came back."} Try again in a moment.</p>
        </div>
      )}
      {turn.plan && turn.errors.length > 0 ? <p className="px-6 pb-4 text-xs text-[#ff9aa6]">Some checks failed: {turn.errors[0]}</p> : null}
    </section>
  );
}

// ---------- follow-up bar ----------

export function FollowUp({ busy, onSend, onVoice, voiceReady }: { busy: boolean; onSend: (t: string) => void; onVoice: () => void; voiceReady: boolean }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        onSend(text);
        setText("");
      }}
      className="flex w-[min(520px,100%)] items-center gap-1.5 rounded-full border border-white/[0.08] bg-[rgba(14,14,17,0.78)] py-1.5 pl-5 pr-1.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-[24px]"
    >
      <label htmlFor="follow-up" className="sr-only">
        Follow up
      </label>
      <input
        id="follow-up"
        name="follow-up"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Follow up — “I can’t afford a taxi”…"
        className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] text-[#ededf0] outline-none placeholder:text-[#62646b]"
      />
      {voiceReady ? (
        <button
          type="button"
          onClick={onVoice}
          disabled={busy}
          aria-label="Speak"
          className="grid h-10 w-10 flex-none place-items-center rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none disabled:opacity-40"
        >
          <span className="h-3.5 w-3.5 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff4e2,#f5b24e_45%,#b8462e)] shadow-[0_0_12px_rgba(245,178,78,0.8)]" />
        </button>
      ) : null}
      <button
        type="submit"
        disabled={busy || !text.trim()}
        aria-label="Re-plan"
        className="h-10 w-10 flex-none rounded-full bg-[#ededf0] text-lg text-[#0a0a0c] focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none disabled:opacity-40"
      >
        ↑
      </button>
    </form>
  );
}
