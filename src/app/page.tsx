"use client";

import dynamic from "next/dynamic";
import { Activity } from "@/components/plan-b/activity";
import { BoardClock } from "@/components/plan-b/board-clock";
import { Composer, type SendOptions } from "@/components/plan-b/composer";
import { affectedStations, knownPlaces } from "@/components/plan-b/format";
import type { MapData } from "@/components/plan-b/journey-map";
import { Pipeline } from "@/components/plan-b/pipeline";
import { PhoneQr } from "@/components/plan-b/phone-qr";
import { PlanCards } from "@/components/plan-b/plan-cards";
import { ReportsTicker } from "@/components/plan-b/reports-ticker";
import { type Turn, usePlanB } from "@/components/plan-b/use-plan-b";
import { parseAgentJson } from "@/lib/agent-json";
import type { Situation } from "@/lib/plan-types";

const JourneyMap = dynamic(() => import("@/components/plan-b/journey-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-white/[0.03]" />,
});

function mapData(turn: Turn, situation?: Situation): MapData {
  const places = knownPlaces(turn.calls.filter((c) => c.name === "find_place"));
  return {
    origin: situation?.origin ?? places[0],
    destination: situation?.destination ?? places[1],
    hubs: (situation?.escapeHubs ?? []).filter((h) => typeof h.lat === "number").slice(0, 2),
    affected: affectedStations(turn.calls),
  };
}

function Header() {
  return (
    <header className="flex items-center gap-4 border-b border-white/10 pb-4">
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-black tracking-tight text-white">
          Plan&nbsp;<span className="text-amber-400">B</span>
        </span>
        <span className="hidden text-sm text-slate-400 sm:inline">When the station knows before the app does</span>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <span className="hidden items-center gap-2 text-xs text-slate-400 md:flex">
          <span className="pb-pulse h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
          Live TfL data
        </span>
        <PhoneQr />
        <BoardClock />
      </div>
    </header>
  );
}

function Hero({ busy, onSend }: { busy: boolean; onSend: (t: string, opts?: SendOptions) => void }) {
  return (
    <section className="mx-auto max-w-3xl py-16 text-center sm:py-24">
      <p className="mb-4 font-mono text-xs uppercase tracking-[0.3em] text-amber-300/80">Lee station · Sunday morning · trains cancelled</p>
      <h1 className="text-4xl font-black tracking-tight text-balance text-white sm:text-6xl">
        Your station just closed.
        <br />
        <span className="text-amber-400">The apps don’t know yet.</span>
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-base text-pretty text-slate-400 sm:text-lg">
        Tell Plan B what the staff just told you, or just say it. Six AI agents check live London data, find the nearest interchange that still works, and get you
        moving.
      </p>
      <div className="mt-8 text-left">
        <Composer busy={busy} onSend={onSend} followUp={false} />
      </div>
      <p className="mt-6 text-xs text-slate-500">Google ADK multi-agent · Gemini on Vertex AI · London Live MCP server · TfL Unified API</p>
    </section>
  );
}

function Run({ turn }: { turn: Turn }) {
  const situation = parseAgentJson<Situation>(turn.outputs.situation_analyst);
  const data = mapData(turn, situation);
  const aheadOfFeeds = situation?.officialFeedShowsIt === false;
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <Pipeline turn={turn} />
      </div>
      <div className="space-y-5 lg:col-span-5">
        <blockquote className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Your report</p>
          <p className="text-pretty text-slate-100">“{turn.message}”</p>
        </blockquote>
        <Activity turn={turn} />
      </div>
      <div className="space-y-5 lg:col-span-7">
        <div className="relative h-[340px] overflow-hidden rounded-2xl border border-white/10 lg:h-[420px]">
          <JourneyMap data={data} />
          <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-slate-200">● you</span>
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-rose-300">✕ stations hit</span>
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-amber-300">★ escape hub</span>
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-emerald-300">⚑ destination</span>
          </div>
        </div>
        {turn.plan ? (
          <PlanCards plan={turn.plan} aheadOfFeeds={aheadOfFeeds} speak={turn.voice} />
        ) : turn.running ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
            Plan A and Plan B appear here once every line is checked live…
          </p>
        ) : null}
        {turn.text ? <p className="text-sm text-slate-300">{turn.text}</p> : null}
        {turn.errors.length > 0 ? (
          <div role="alert" className="space-y-1 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">
            {[...new Set(turn.errors)].slice(0, 3).map((e) => (
              <p key={e}>Something went wrong: {e}. Try again in a moment.</p>
            ))}
          </div>
        ) : null}
        {turn.ms != null ? <p className="text-right font-mono text-xs tabular-nums text-slate-500">Done in {(turn.ms / 1000).toFixed(1)}&nbsp;s</p> : null}
      </div>
    </div>
  );
}

export default function Home() {
  const { turns, busy, send } = usePlanB();
  const current = turns.at(-1);
  return (
    <main className="pb-bg min-h-screen text-slate-100">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <Header />
        <ReportsTicker />
        {current ? (
          <div className="space-y-5 pt-5">
            <Composer busy={busy} onSend={send} followUp />
            <Run key={turns.length} turn={current} />
          </div>
        ) : (
          <Hero busy={busy} onSend={send} />
        )}
      </div>
    </main>
  );
}
