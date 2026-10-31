"use client";
// Landing: the orb, the promise, one input. Tap the orb (or the small one) to speak.
import { useState } from "react";
import { Orb } from "./orb";
import { ReportsTicker } from "./reports-ticker";

export const EXAMPLES = [
  {
    label: "Lee — trains cancelled by wind",
    text: "I'm at Lee station. Staff at the entrance say all trains are cancelled because of the wind. I need to be at Encode Hub (41 Pitfield St, N1 6DA) for a pitch in an hour and a half.",
  },
  { label: "Lewisham DLR closed", text: "Lewisham DLR is closed, there's a police incident. I need to get to Canary Wharf as fast as possible." },
  {
    label: "Crash ahead on the A2",
    text: "I'm driving on Shooters Hill Road in Blackheath, heading to the O2. A lorry has crashed just ahead and blocked both lanes, and Google Maps doesn't show anything yet. I need to be at the O2 in 40 minutes.",
  },
  { label: "Central line suspended", text: "I'm at Stratford, the Central line just got suspended and I need to reach Liverpool Street in 30 minutes. Cheap options please." },
];

const MIC_DOT = "rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff4e2,#f5b24e_45%,#b8462e)]";

export function Hero({ busy, onSend, onVoice, voiceReady }: { busy: boolean; onSend: (t: string) => void; onVoice: () => void; voiceReady: boolean }) {
  const [text, setText] = useState("");
  return (
    <>
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pb-[110px] pt-[90px] text-center">
        <button
          type="button"
          onClick={voiceReady ? onVoice : undefined}
          aria-label="Speak to Plan B"
          className="aspect-square w-[min(340px,70vw)] cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none"
        >
          <Orb mode="idle" className="h-full w-full" />
        </button>
        <p className="mt-[18px] font-mono text-[11px] uppercase tracking-[0.24em] text-[#8a8d95]">Tap the orb · tell it what you see</p>
        <h1 className="mt-[22px] text-[clamp(40px,5.4vw,74px)] font-medium leading-none tracking-[-0.045em] text-balance">
          Your station just closed.
          <br />
          <span className="font-serif font-normal italic tracking-[-0.02em] text-[#f2c27b]">The apps don’t know yet.</span>
        </h1>
        <p className="mt-[22px] max-w-[540px] text-base leading-relaxed text-pretty text-[#8a8d95]">
          Your maps app runs on official feeds, and feeds lag behind the staff at the gate or the crash in front of you. Tell Plan B what you see: six
          agents re-plan around it with live London data, and warn the next traveller.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim() || busy) return;
            onSend(text);
          }}
          className="mt-10 flex w-[min(660px,100%)] items-center gap-2 rounded-full border border-white/[0.08] bg-[rgba(22,22,26,0.7)] py-2 pl-6 pr-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[24px] focus-within:border-[rgba(245,178,78,0.4)]"
        >
          <label htmlFor="situation" className="sr-only">
            Describe your situation
          </label>
          <input
            id="situation"
            name="situation"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="I’m at Lee station, staff say all trains are cancelled…"
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-[#ededf0] outline-none placeholder:text-[#62646b]"
          />
          {voiceReady ? (
            <button
              type="button"
              onClick={onVoice}
              aria-label="Speak"
              className="grid h-12 w-12 flex-none place-items-center rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none"
            >
              <span className={`h-4 w-4 ${MIC_DOT} shadow-[0_0_14px_rgba(245,178,78,0.8)]`} />
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Find my Plan B"
            className="grid h-12 w-12 flex-none place-items-center rounded-full bg-[#ededf0] text-xl text-[#0a0a0c] focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none disabled:opacity-60"
          >
            ↑
          </button>
        </form>
        <div className="mt-[18px] flex flex-wrap justify-center gap-x-[22px] gap-y-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              disabled={busy}
              onClick={() => onSend(ex.text)}
              className="py-1 text-[13.5px] text-[#7c7f87] transition-colors hover:text-[#ededf0] focus-visible:text-[#ededf0] focus-visible:outline-none"
            >
              {ex.label}
            </button>
          ))}
        </div>
        <p className="mt-8 max-w-[560px] text-[13px] text-pretty text-[#62646b]">
          When the apps are right, use the apps. <span className="text-[#a7a9b0]">Plan B is for the gap</span> — trains, buses or the road — and when the
          feeds catch up, it uses them too.
        </p>
      </main>
      <div className="absolute inset-x-0 bottom-7 z-10 flex justify-center px-6">
        <ReportsTicker />
      </div>
    </>
  );
}
