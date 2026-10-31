"use client";

import dynamic from "next/dynamic";
import { useCallback, useSyncExternalStore } from "react";
import { BoardClock } from "@/components/plan-b/board-clock";
import { affectedStations, driveRoutesFor, knownPlaces } from "@/components/plan-b/format";
import { Hero } from "@/components/plan-b/hero";
import type { MapData } from "@/components/plan-b/journey-map";
import { PhoneQr } from "@/components/plan-b/phone-qr";
import { type Turn, usePlanB } from "@/components/plan-b/use-plan-b";
import { useVoiceInput } from "@/components/plan-b/use-voice-input";
import { VoiceOverlay } from "@/components/plan-b/voice-overlay";
import { AgentPanel, FollowUp, PlanPanel } from "@/components/plan-b/workspace";
import { parseAgentJson } from "@/lib/agent-json";
import type { Situation } from "@/lib/plan-types";

const JourneyMap = dynamic(() => import("@/components/plan-b/journey-map"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#0a0a0c]" />,
});

const NOISE =
  "url(data:image/svg+xml;utf8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27180%27%20height=%27180%27%3E%3Cfilter%20id=%27n%27%3E%3CfeTurbulence%20type=%27fractalNoise%27%20baseFrequency=%270.85%27%20numOctaves=%273%27%20stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect%20width=%27100%25%27%20height=%27100%25%27%20filter=%27url(%23n)%27/%3E%3C/svg%3E)";

const WIDE = "(min-width: 1100px)";
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );

function mapData(turn: Turn, situation?: Situation): MapData {
  const places = knownPlaces(turn.calls.filter((c) => c.name === "find_place"));
  const drive = driveRoutesFor(turn.calls);
  const scanned = turn.calls.some((c) => c.name === "nearby_stations" && c.result !== undefined) || Boolean(situation);
  return {
    stage: turn.plan ? "route" : scanned ? "scan" : "origin",
    origin: situation?.origin ?? places[0],
    destination: situation?.destination ?? places[1],
    hubs: (situation?.escapeHubs ?? []).filter((h) => typeof h.lat === "number").slice(0, 1),
    affected: affectedStations(turn.calls),
    incident: drive.incident ?? (situation?.mode === "driving" ? situation.incident : undefined),
    routes: drive.routes,
  };
}

function Header({ onHome }: { onHome: () => void }) {
  return (
    <header className="absolute inset-x-0 top-0 z-[700] flex items-center gap-3.5 px-7 py-[22px]">
      <button
        type="button"
        onClick={onHome}
        className="flex items-center gap-2.5 rounded-full text-[#ededf0] focus-visible:ring-2 focus-visible:ring-[#f5b24e] focus-visible:outline-none"
      >
        <span className="h-[18px] w-[18px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff4e2,#f5b24e_45%,#b8462e)] shadow-[0_0_16px_rgba(245,178,78,0.6)]" />
        <span className="text-base font-medium tracking-[-0.01em]">Plan B</span>
      </button>
      <div className="ml-auto flex items-center gap-[18px] text-[12.5px] text-[#8a8d95]">
        <span className="hidden items-center gap-2 sm:flex">
          <span className="pb-pulse h-1.5 w-1.5 rounded-full bg-[#5fd49a] shadow-[0_0_8px_#5fd49a]" />
          Live TfL
        </span>
        <PhoneQr />
        <BoardClock />
      </div>
    </header>
  );
}

function Workspace({
  turn,
  busy,
  onSend,
  onVoice,
  voiceReady,
}: {
  turn: Turn;
  busy: boolean;
  onSend: (t: string) => void;
  onVoice: () => void;
  voiceReady: boolean;
}) {
  const wide = useWide();
  const situation = parseAgentJson<Situation>(turn.outputs.situation_analyst);
  const data = mapData(turn, situation);
  return (
    <div className="relative z-10 flex flex-col gap-3.5 px-3.5 pb-6 pt-[78px] min-[1100px]:h-screen min-[1100px]:p-0">
      <div className="relative h-[max(46vh,380px)] flex-none overflow-hidden rounded-3xl min-[1100px]:absolute min-[1100px]:inset-0 min-[1100px]:h-full min-[1100px]:rounded-none">
        <JourneyMap data={data} padLeft={wide ? 440 : 30} padRight={wide ? 480 : 30} />
        <div
          className="pointer-events-none absolute inset-0 z-[500]"
          style={{
            background: wide
              ? "linear-gradient(90deg, rgba(5,5,6,0.75), transparent 30%, transparent 62%, rgba(5,5,6,0.75)), linear-gradient(180deg, rgba(5,5,6,0.7), transparent 14%, transparent 86%, rgba(5,5,6,0.7))"
              : "radial-gradient(ellipse at center, transparent 60%, rgba(5,5,6,0.45))",
          }}
        />
      </div>
      <div className="relative z-[600] min-[1100px]:absolute min-[1100px]:bottom-6 min-[1100px]:left-6 min-[1100px]:top-20 min-[1100px]:flex min-[1100px]:w-[380px] min-[1100px]:flex-col">
        <AgentPanel turn={turn} />
      </div>
      <div className="relative z-[600] min-[1100px]:absolute min-[1100px]:right-6 min-[1100px]:top-20 min-[1100px]:flex min-[1100px]:max-h-[calc(100vh-104px)] min-[1100px]:w-[420px] min-[1100px]:flex-col">
        <PlanPanel turn={turn} situation={situation} map={data} />
      </div>
      <div className="relative z-[600] flex justify-center min-[1100px]:absolute min-[1100px]:bottom-6 min-[1100px]:left-[428px] min-[1100px]:right-[468px]">
        <FollowUp busy={busy} onSend={onSend} onVoice={onVoice} voiceReady={voiceReady} />
      </div>
    </div>
  );
}

export default function Home() {
  const { turns, busy, send, reset } = usePlanB();
  const onVoiceText = useCallback((text: string) => send(text, { voice: true }), [send]);
  const voice = useVoiceInput(onVoiceText);
  const current = turns.at(-1);
  const showVoice = voice.status === "listening" || voice.status === "transcribing" || voice.status === "error";
  const startVoice = () => {
    if (!busy) void voice.start();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050506] text-[#ededf0]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_32rem_at_50%_-8rem,rgba(245,178,78,0.07),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 z-40 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: NOISE }} />
      <Header onHome={reset} />
      {current ? (
        <Workspace key={turns.length} turn={current} busy={busy} onSend={send} onVoice={startVoice} voiceReady={voice.supported} />
      ) : (
        <Hero busy={busy} onSend={send} onVoice={startVoice} voiceReady={voice.supported} />
      )}
      {showVoice ? <VoiceOverlay status={voice.status} error={voice.error} onStop={voice.stop} onCancel={voice.cancel} /> : null}
    </div>
  );
}
