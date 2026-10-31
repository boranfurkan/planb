"use client";
// Records the traveller, stops by itself when they pause, and transcribes with Gemini (/api/transcribe),
// which knows London station names. Audio is converted to 16 kHz mono WAV in the browser first.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type VoiceStatus = "idle" | "listening" | "transcribing" | "error";

const SPEECH_LEVEL = 0.035; // RMS above this counts as speech
const SILENCE_LEVEL = 0.025; // a busy venue is not silent: tap the mic to stop early
const SILENCE_MS = 1400; // stop after this much quiet once speech has started
const MAX_MS = 25_000;

/** Live microphone level (0..1) for the orb; read every animation frame, so a plain mutable object. */
export const voiceLevel = { current: 0.1 };

const noSubscribe = () => () => {};
const canRecord = () => typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

async function toWav16k(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const rate = 16_000;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const pcm = (await offline.startRendering()).getChannelData(0);

  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const ascii = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  out.setUint32(4, 36 + pcm.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, 1, true); // mono
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  ascii(36, "data");
  out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([out.buffer], { type: "audio/wav" });
}

export function useVoiceInput(onFinal: (text: string) => void) {
  const supported = useSyncExternalStore(noSubscribe, canRecord, () => false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);
  useEffect(() => () => cleanup.current?.(), []);

  const cancelled = useRef(false);
  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);
  /** Stop without transcribing. */
  const cancel = useCallback(() => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (recorder.current) return;
    cancelled.current = false;
    setError(null);
    setTranscript("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setStatus("error");
      setError("Microphone access is blocked. Allow it in the address bar and try again.");
      return;
    }

    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Silence detection: stop shortly after the traveller stops talking.
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 2048;
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const began = performance.now();
    let heard = false;
    let quietSince = 0;
    let frame = 0;
    const watch = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const rms = Math.sqrt(sum / samples.length);
      voiceLevel.current = Math.min(1, rms * 9);
      const now = performance.now();
      if (rms > SPEECH_LEVEL) {
        heard = true;
        quietSince = 0;
      } else if (heard && rms < SILENCE_LEVEL) {
        quietSince ||= now;
        if (now - quietSince > SILENCE_MS) return stop();
      }
      if (now - began > MAX_MS) return stop();
      frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);

    cleanup.current = () => {
      voiceLevel.current = 0.1;
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((t) => t.stop());
      void audio.close();
    };

    rec.onstop = async () => {
      cleanup.current?.();
      cleanup.current = null;
      recorder.current = null;
      if (!heard || cancelled.current) {
        setStatus("idle");
        return;
      }
      setStatus("transcribing");
      try {
        const wav = await toWav16k(new Blob(chunks, { type: rec.mimeType }));
        const res = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
        if (!res.ok) throw new Error(await res.text());
        const { text } = (await res.json()) as { text: string };
        setTranscript(text);
        if (text.trim()) {
          setStatus("idle");
          onFinalRef.current(text.trim());
        } else {
          setStatus("error");
          setError("I didn’t catch that. Try again, or type it.");
        }
      } catch {
        setStatus("error");
        setError("Couldn't transcribe that. Try again, or type it.");
      }
    };

    recorder.current = rec;
    rec.start();
    setStatus("listening");
  }, [stop]);

  return { supported, status, transcript, error, start, stop, cancel };
}
