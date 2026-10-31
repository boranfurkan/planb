// The agent pipeline as a live diagram: each node lights up while its agent works.
import { AGENTS, type AgentName, conclusion, SCOUTS } from "./format";
import type { Turn } from "./use-plan-b";

type NodeState = "idle" | "active" | "done";

const ORDER: AgentName[] = ["situation_analyst", "transit_scout", "hub_scout", "taxi_scout", "verifier", "presenter"];

function nodeState(name: AgentName, turn: Turn): NodeState {
  const seen = turn.agents.includes(name);
  if (!seen) return "idle";
  const later = ORDER.slice(ORDER.indexOf(name) + 1).filter((n) => !SCOUTS.includes(n) || !SCOUTS.includes(name));
  const done = Boolean(turn.outputs[name]) || later.some((n) => turn.agents.includes(n)) || (name === "presenter" && Boolean(turn.plan)) || !turn.running;
  return done ? "done" : "active";
}

const STATE_STYLE: Record<NodeState, string> = {
  idle: "border-white/10 bg-white/[0.02] text-slate-500",
  active: "border-amber-400/70 bg-amber-400/10 text-white shadow-[0_0_24px_-4px_rgba(251,191,36,0.55)]",
  done: "border-emerald-400/40 bg-emerald-400/[0.06] text-slate-100",
};

function AgentNode({ name, turn }: { name: AgentName; turn: Turn }) {
  const a = AGENTS[name];
  const state = nodeState(name, turn);
  const calls = turn.calls.filter((c) => c.author === name).length;
  return (
    <div className={`relative rounded-xl border px-3 py-2 transition-[border-color,background-color,box-shadow] duration-500 ${STATE_STYLE[state]}`}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true">{a.icon}</span>
        <span className="text-sm font-semibold">{a.short}</span>
        <span className="ml-auto text-xs tabular-nums text-slate-400">{calls > 0 ? `${calls} call${calls === 1 ? "" : "s"}` : null}</span>
        {state === "active" ? <span className="pb-pulse h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" /> : null}
        {state === "done" ? <span className="text-xs text-emerald-400" aria-hidden="true">✓</span> : null}
      </div>
    </div>
  );
}

function Arrow({ lit }: { lit: boolean }) {
  return (
    <div className="flex items-center justify-center py-1 lg:px-1 lg:py-0" aria-hidden="true">
      <div className={`h-4 w-px lg:h-px lg:w-6 ${lit ? "bg-amber-400/70" : "bg-white/10"}`} />
    </div>
  );
}

export function Pipeline({ turn }: { turn: Turn }) {
  const lit = (n: AgentName) => turn.agents.includes(n);
  const summary = conclusion(turn.outputs.situation_analyst);
  return (
    <section aria-label="Agent pipeline" className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Agent pipeline · Google ADK</h2>
        <span className="text-xs text-slate-500">sequential → parallel → loop</span>
      </div>
      <div className="flex flex-col lg:flex-row lg:items-center">
        <div className="lg:flex-1">
          <AgentNode name="situation_analyst" turn={turn} />
        </div>
        <Arrow lit={lit("transit_scout")} />
        <div className="grid gap-1.5 rounded-xl border border-dashed border-amber-400/20 p-1.5 lg:flex-[1.6] lg:grid-cols-3">
          {SCOUTS.map((s) => (
            <AgentNode key={s} name={s} turn={turn} />
          ))}
        </div>
        <Arrow lit={lit("verifier")} />
        <div className="lg:flex-1">
          <AgentNode name="verifier" turn={turn} />
        </div>
        <Arrow lit={lit("presenter")} />
        <div className="lg:flex-1">
          <AgentNode name="presenter" turn={turn} />
        </div>
      </div>
      {summary ? <p className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-slate-300">🧭 {summary}</p> : null}
    </section>
  );
}
