"use client";
// What other Plan B travellers reported in the last few hours: often ahead of the official feeds.
import { useEffect, useState } from "react";

type LiveReport = { where: string; what: string; minutesAgo: number };

const POLL_MS = 8_000;

export function ReportsTicker() {
  const [reports, setReports] = useState<LiveReport[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/reports", { cache: "no-store" });
        const data = (await res.json()) as { reports: LiveReport[] };
        if (alive) setReports(data.reports);
      } catch {
        /* keep the last list */
      }
    };
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (reports.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="mt-3 flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-500/[0.08] px-3 py-2 text-sm">
      <span className="mt-0.5 flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-rose-300">
        <span className="pb-pulse h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden="true" />
        Traveller reports
      </span>
      <ul className="min-w-0 flex-1 space-y-0.5">
        {reports.slice(0, 3).map((r, i) => (
          <li key={`${r.where}-${i}`} className="truncate text-rose-50">
            <span className="font-semibold">{r.where}</span>: {r.what}
            <span className="ml-2 font-mono text-xs tabular-nums text-rose-300/80">{r.minutesAgo === 0 ? "just now" : `${r.minutesAgo} min ago`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
