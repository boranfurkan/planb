"use client";
// Plan B reads the answer aloud with Gemini TTS: hands-free at a busy station.
import { useEffect, useRef, useState } from "react";
import type { Plan } from "@/lib/plan-types";

export function planSpeech(plan: Plan) {
  const a = plan.options[0];
  const b = plan.options[1];
  return [
    `${plan.headline}.`,
    plan.insight,
    a ? `${a.label}: ${a.title}. Leave at ${a.leaveAt}, arrive by ${a.arriveBy}.` : "",
    b ? `If that fails, ${b.label}: ${b.title}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

type Status = "idle" | "loading" | "playing" | "error";

export function ReadAloud({ plan, autoPlay }: { plan: Plan; autoPlay: boolean }) {
  const [status, setStatus] = useState<Status>("idle");
  const audio = useRef<HTMLAudioElement | null>(null);
  const started = useRef(false);

  async function play() {
    if (status === "playing") {
      audio.current?.pause();
      setStatus("idle");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: planSpeech(plan) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      audio.current?.pause();
      const el = new Audio(url);
      el.onended = () => setStatus("idle");
      audio.current = el;
      await el.play();
      setStatus("playing");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    if (autoPlay && !started.current) {
      started.current = true;
      void play();
    }
    return () => audio.current?.pause();
    // play only once per plan, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = { idle: "🔊 Read It to Me", loading: "Preparing voice…", playing: "■ Stop", error: "Voice unavailable, try again" }[status];
  return (
    <button
      type="button"
      onClick={play}
      disabled={status === "loading"}
      className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-amber-400 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none disabled:opacity-60"
    >
      {label}
    </button>
  );
}
