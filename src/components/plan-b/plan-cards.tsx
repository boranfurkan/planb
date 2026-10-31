"use client";
// The answer: Plan A / Plan B as tickets, with the key insight on top.
import { useEffect, useRef } from "react";
import type { Plan, PlanOption } from "@/lib/plan-types";
import { MODE_ICON } from "./format";

const RELIABILITY: Record<PlanOption["reliability"], string> = {
  high: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  medium: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  low: "bg-rose-400/15 text-rose-300 ring-rose-400/30",
};

function Ticket({ option, primary }: { option: PlanOption; primary: boolean }) {
  return (
    <article
      className={`pb-rise relative overflow-hidden rounded-2xl border p-5 ${
        primary ? "border-amber-400/60 bg-gradient-to-b from-amber-400/[0.09] to-transparent" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`font-mono text-xs font-bold uppercase tracking-[0.2em] ${primary ? "text-amber-300" : "text-slate-400"}`}>{option.label}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ring-1 ${RELIABILITY[option.reliability] ?? RELIABILITY.medium}`}>
          {option.reliability} reliability
        </span>
      </div>
      <h3 className="mt-2 text-lg font-semibold text-balance text-white">{option.title}</h3>
      <div className="mt-3 flex items-end gap-3 font-mono tabular-nums">
        <span className="pb-board text-3xl">{option.leaveAt}</span>
        <span className="pb-1 text-slate-500" aria-hidden="true">
          →
        </span>
        <span className="pb-board text-3xl">{option.arriveBy}</span>
        <span className="pb-1 ml-auto text-sm text-slate-400">{option.totalMinutes}&nbsp;min</span>
      </div>
      {option.cost ? <p className="mt-1 text-sm text-slate-400">{option.cost}</p> : null}
      <ol className="mt-4 space-y-2 border-l border-dashed border-white/15 pl-4">
        {option.steps.map((s, i) => (
          <li key={i} className="relative text-sm text-slate-200">
            <span className="absolute -left-[1.6rem] top-0 grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-xs" aria-hidden="true">
              {MODE_ICON[s.mode.toLowerCase()] ?? "•"}
            </span>
            <span>{s.text}</span>
            {s.minutes != null ? <span className="ml-2 font-mono text-xs tabular-nums text-slate-500">{s.minutes}&nbsp;min</span> : null}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-pretty text-slate-400">{option.why}</p>
    </article>
  );
}

export function PlanCards({ plan, aheadOfFeeds }: { plan: Plan; aheadOfFeeds: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  return (
    <section ref={ref} aria-label="Your Plan B" className="scroll-mt-6 space-y-4">
      <div>
        {aheadOfFeeds ? (
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-medium text-rose-200 ring-1 ring-rose-400/30">
            <span className="pb-pulse h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden="true" />
            Official feeds don’t show this yet: planned from your report
          </p>
        ) : null}
        <h2 className="text-2xl font-bold text-balance text-white sm:text-3xl">{plan.headline}</h2>
        <p className="mt-1 text-sm text-pretty text-slate-400">{plan.understood}</p>
      </div>
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-3 text-sm text-pretty text-amber-50">
        <span className="font-semibold text-amber-300">The key move: </span>
        {plan.insight}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {plan.options.map((o, i) => (
          <Ticket key={o.label + i} option={o} primary={i === 0} />
        ))}
      </div>
      {plan.warnings?.length ? (
        <ul className="space-y-1 text-sm text-rose-200/90">
          {plan.warnings.map((w, i) => (
            <li key={i}>
              <span aria-hidden="true">⚠️ </span>
              {w}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
