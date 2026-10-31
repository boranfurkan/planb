"use client";
// Full-screen listening view: the orb breathes with your voice; Gemini transcribes when you pause.
import { useEffect } from "react";
import { Orb } from "./orb";
import type { VoiceStatus } from "./use-voice-input";

export function VoiceOverlay({ status, error, onStop, onCancel }: { status: VoiceStatus; error: string | null; onStop: () => void; onCancel: () => void }) {
  const transcribing = status === "transcribing";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={transcribing ? "Understanding what you said" : "Listening"}
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overscroll-contain bg-[radial-gradient(circle_at_50%_40%,rgba(16,12,18,0.82),rgba(4,4,5,0.97)_65%)] p-8 backdrop-blur-[30px]"
    >
      <div className="absolute inset-x-7 top-6 flex items-center">
        <span className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-[#c9cad0]">
          <span className={`pb-pulse h-[7px] w-[7px] rounded-full ${transcribing ? "bg-[#8a7dff] shadow-[0_0_10px_#8a7dff]" : "bg-[#f5b24e] shadow-[0_0_10px_#f5b24e]"}`} />
          {transcribing ? "Understanding" : "Listening"}
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="ml-auto h-10 w-10 rounded-full border border-white/[0.12] bg-white/[0.03] text-base text-[#c9cad0] hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none"
        >
          ✕
        </button>
      </div>
      <div className="aspect-square w-[min(500px,72vw,52vh)]">
        <Orb mode={transcribing ? "thinking" : "listening"} className="h-full w-full" />
      </div>
      <p aria-live="polite" className="mt-6 min-h-[84px] max-w-[760px] text-center text-[clamp(22px,2.6vw,32px)] font-light leading-snug tracking-[-0.02em] text-balance text-[#6f7179]">
        {error ? (
          <span className="text-[#ff9aa6]">{error}</span>
        ) : transcribing ? (
          <>
            Matching station names <span className="text-white">with Gemini…</span>
          </>
        ) : (
          <>
            Where are you, what happened, <span className="text-white">and where do you need to be?</span>
          </>
        )}
      </p>
      <div className="mt-7 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onStop}
          disabled={transcribing}
          aria-label="Finish speaking"
          className="grid h-16 w-16 place-items-center rounded-full bg-[#ededf0] shadow-[0_0_0_8px_rgba(255,255,255,0.05)] focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none disabled:opacity-50"
        >
          <span className="h-[18px] w-[18px] rounded-[5px] bg-[#0a0a0c]" />
        </button>
        <span className="text-[12.5px] text-[#7c7f87]">{transcribing ? "Transcribing with Gemini · matching station names" : "Speak naturally · stops when you pause"}</span>
      </div>
    </div>
  );
}
