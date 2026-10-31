"use client";
// What other Plan B travellers reported in the last few hours (often ahead of the official feeds), one at a time.
import { useEffect, useState } from "react";

type LiveReport = { where: string; what: string; minutesAgo: number };

const POLL_MS = 8_000;
const ROTATE_MS = 4_000;

export function ReportsTicker() {
  const [reports, setReports] = useState<LiveReport[]>([]);
  const [i, setI] = useState(0);

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
    const poll = setInterval(load, POLL_MS);
    const rotate = setInterval(() => setI((n) => n + 1), ROTATE_MS);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(rotate);
    };
  }, []);

  if (reports.length === 0) return null;
  const r = reports[i % reports.length];
  return (
    <div role="status" aria-live="polite" className="flex max-w-full items-center gap-3 rounded-full border border-[rgba(255,90,110,0.18)] bg-[rgba(255,90,110,0.07)] px-4 py-[9px] text-[13px]">
      <span className="pb-pulse h-1.5 w-1.5 flex-none rounded-full bg-[#ff5a6e] shadow-[0_0_8px_#ff5a6e]" aria-hidden="true" />
      <span className="flex-none font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#ff9aa6]">Travellers report</span>
      <span className="truncate text-[#ededf0]">
        <b className="font-medium">{r.where}</b> <span className="text-[#a7a9b0]">— {r.what}</span>
      </span>
      <span className="flex-none font-mono text-[11px] text-[#7c7f87]">{r.minutesAgo === 0 ? "just now" : `${r.minutesAgo} min`}</span>
    </div>
  );
}
