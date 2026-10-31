"use client";
// Speech to text with the browser's speech recognition (Chrome, Edge, Safari). British English, live interim text.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const noSubscribe = () => () => {};

export function useSpeechInput(onFinal: (text: string) => void) {
  // false on the server, the real answer in the browser: no hydration mismatch, no effect.
  const supported = useSyncExternalStore(noSubscribe, () => Boolean(recognitionCtor()), () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef("");
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || rec.current) return;
    const r = new Ctor();
    r.lang = "en-GB";
    r.interimResults = true;
    r.continuous = false;
    finalText.current = "";
    setInterim("");
    setError(null);
    r.onresult = (e) => {
      let live = "";
      let done = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) done += res[0].transcript;
        else live += res[0].transcript;
      }
      finalText.current = done;
      setInterim((done + " " + live).trim());
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone access is blocked. Allow it in the address bar." : `Speech error: ${e.error}`);
    r.onend = () => {
      rec.current = null;
      setListening(false);
      const text = finalText.current.trim();
      if (text) onFinalRef.current(text);
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
