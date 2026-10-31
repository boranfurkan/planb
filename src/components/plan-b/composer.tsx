"use client";
// Where the traveller says what's wrong: type it, or tap the mic and say it. Enter sends, Shift+Enter adds a line.
import { useState, useSyncExternalStore } from "react";
import { useVoiceInput } from "./use-voice-input";

export const EXAMPLES = [
  {
    label: "Lee: trains cancelled by wind",
    text: "I'm at Lee station. Staff at the entrance say all trains are cancelled because of the wind. I need to be at Encode Hub (41 Pitfield St, N1 6DA) for a pitch in an hour and a half.",
  },
  { label: "Lewisham DLR closed", text: "Lewisham DLR is closed, there's a police incident. I need to get to Canary Wharf as fast as possible." },
  {
    label: "🚗 Crash ahead on the A2",
    text: "I'm driving on Shooters Hill Road in Blackheath, heading to the O2. A lorry has crashed just ahead and blocked both lanes, and Google Maps doesn't show anything yet. I need to be at the O2 in 40 minutes.",
  },
  { label: "Central line suspended", text: "I'm at Stratford, the Central line just got suspended and I need to reach Liverpool Street in 30 minutes. Cheap options please." },
];

type Fix = { lat: number; lon: number };

/** Optional: attach the traveller's GPS position, so "where am I" needs no typing (useful when driving). */
const noSubscribe = () => () => {};
const hasGeolocation = () => Boolean(navigator.geolocation);

function LocationButton({ fix, onFix }: { fix: Fix | null; onFix: (f: Fix | null) => void }) {
  const [state, setState] = useState<"idle" | "locating" | "denied">("idle");
  // Hidden during server render and hydration, shown once the browser confirms geolocation.
  const supported = useSyncExternalStore(noSubscribe, hasGeolocation, () => false);
  if (!supported) return null;
  const toggle = () => {
    if (fix) return onFix(null);
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setState("idle");
        onFix({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lon: Math.round(p.coords.longitude * 1e5) / 1e5 });
      },
      () => setState("denied"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  const label = fix ? "📍 Location On" : state === "locating" ? "Locating…" : state === "denied" ? "📍 Location Blocked" : "📍 Use My Location";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={Boolean(fix)}
      className={`h-10 rounded-xl border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none ${
        fix ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200" : "border-white/15 text-slate-300 hover:border-amber-400"
      }`}
    >
      {label}
    </button>
  );
}

export type SendOptions = { voice?: boolean };

const VOICE_HINT = {
  listening: "Listening… speak now, it stops when you pause",
  transcribing: "Transcribing with Gemini…",
} as const;

function MicButton({ busy, onVoice }: { busy: boolean; onVoice: (text: string) => void }) {
  const voice = useVoiceInput(onVoice);
  if (!voice.supported) return null;
  const listening = voice.status === "listening";
  const line =
    voice.status === "error"
      ? voice.error
      : voice.status === "listening" || voice.status === "transcribing"
        ? VOICE_HINT[voice.status]
        : voice.transcript
          ? `“${voice.transcript}”`
          : null;
  return (
    <>
      <button
        type="button"
        disabled={busy || voice.status === "transcribing"}
        onClick={listening ? voice.stop : voice.start}
        aria-label={listening ? "Stop recording" : "Speak your situation"}
        aria-pressed={listening}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none disabled:opacity-40 ${
          listening ? "border-rose-400 bg-rose-500/20 text-rose-200" : "border-white/15 text-slate-200 hover:border-amber-400"
        }`}
      >
        <span aria-hidden="true" className={listening ? "pb-pulse" : undefined}>
          🎙️
        </span>
      </button>
      {line ? (
        <p aria-live="polite" className={`order-last basis-full text-sm ${voice.status === "error" ? "text-rose-300" : "text-amber-200"}`}>
          {line}
        </p>
      ) : null}
    </>
  );
}

export function Composer({ busy, onSend, followUp }: { busy: boolean; onSend: (text: string, opts?: SendOptions) => void; followUp: boolean }) {
  const [text, setText] = useState("");
  const [fix, setFix] = useState<Fix | null>(null);
  const withLocation = (t: string) => (fix ? `${t}\n(My location: ${fix.lat}, ${fix.lon})` : t);
  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(withLocation(text));
    setText("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur focus-within:border-amber-400/50"
    >
      <label htmlFor="situation" className="sr-only">
        Describe your situation
      </label>
      <textarea
        id="situation"
        name="situation"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={followUp ? 2 : 3}
        placeholder={
          followUp
            ? "Follow up, e.g. “I can’t afford a taxi” or “the 261 isn’t coming”…"
            : "e.g. “I’m at Lee station, staff say trains are cancelled. I need to be at N1 6DA by 13:45”…"
        }
        className="w-full resize-none bg-transparent px-1 text-base text-white placeholder:text-slate-500 focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {followUp
          ? null
          : EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                disabled={busy}
                onClick={() => onSend(ex.text)}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-amber-400 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none disabled:opacity-40"
              >
                {ex.label}
              </button>
            ))}
        <div className="ml-auto flex items-center gap-2">
          <LocationButton fix={fix} onFix={setFix} />
          <MicButton busy={busy} onVoice={(spoken) => onSend(withLocation(spoken), { voice: true })} />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="h-10 rounded-xl bg-amber-400 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-300 focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:outline-none disabled:opacity-40"
          >
            {busy ? "Re-Planning…" : followUp ? "Re-Plan" : "Find My Plan B"}
          </button>
        </div>
      </div>
    </form>
  );
}
