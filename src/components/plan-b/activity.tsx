"use client";
// Live feed of every tool call, tagged with the agent that made it.
import { useEffect, useRef } from "react";
import { AGENTS, type AgentName, conclusion, describe, knownPlaces, SCOUTS, TOOL_ICON, type ToolCall } from "./format";
import type { Turn } from "./use-plan-b";

const CHIP: Record<AgentName, string> = {
  situation_analyst: "bg-sky-400/15 text-sky-300",
  transit_scout: "bg-violet-400/15 text-violet-300",
  hub_scout: "bg-amber-400/15 text-amber-300",
  taxi_scout: "bg-orange-400/15 text-orange-300",
  verifier: "bg-emerald-400/15 text-emerald-300",
  presenter: "bg-fuchsia-400/15 text-fuchsia-300",
};

function Row({ call, known }: { call: ToolCall; known: ReturnType<typeof knownPlaces> }) {
  const d = describe(call, known);
  const agent = (call.author ?? "") as AgentName;
  const meta = AGENTS[agent];
  return (
    <li className="pb-row grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 border-b border-white/5 py-2 last:border-0">
      <span className="pt-0.5 font-mono text-[11px] tabular-nums text-slate-500">+{(call.at / 1000).toFixed(1)}s</span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {meta ? <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CHIP[agent]}`}>{meta.short}</span> : null}
          <span aria-hidden="true">{TOOL_ICON[call.name] ?? "🔧"}</span>
          <span className="truncate text-slate-100">{d.title}</span>
          {call.result === undefined ? <span className="ml-auto shrink-0 text-xs text-amber-300">working…</span> : null}
        </div>
        {d.detail ? <p className="mt-0.5 line-clamp-2 break-words text-xs text-slate-400">{d.detail}</p> : null}
      </div>
    </li>
  );
}

export function Activity({ turn }: { turn: Turn }) {
  const box = useRef<HTMLOListElement>(null);
  const known = knownPlaces(turn.calls);
  const count = turn.calls.length;

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const scoutLines = SCOUTS.map((s) => ({ s, line: conclusion(turn.outputs[s]) })).filter((x) => x.line);

  return (
    <section aria-label="Live agent activity" className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Live tool calls · London Live MCP</h2>
        <span className="font-mono text-xs tabular-nums text-slate-500">{count} calls</span>
      </div>
      <ol ref={box} aria-live="polite" className="max-h-80 overflow-y-auto pr-1 [scrollbar-width:thin]">
        {turn.calls.map((c) => (
          <Row key={c.id} call={c} known={known} />
        ))}
        {count === 0 && turn.running ? <li className="py-2 text-sm text-slate-400">Reading your situation…</li> : null}
      </ol>
      {scoutLines.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
          {scoutLines.map(({ s, line }) => (
            <p key={s} className="text-xs text-slate-300">
              <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CHIP[s]}`}>{AGENTS[s].short}</span>
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
