"use client";
// Streams one Plan B run from /api/chat and keeps every turn of the conversation.
import { startTransition, useCallback, useRef, useState } from "react";
import type { Plan, StreamItem } from "@/lib/plan-types";
import type { ToolCall } from "./format";

export type Turn = {
  message: string;
  voice: boolean;
  startedAt: number;
  calls: ToolCall[];
  agents: string[];
  outputs: Record<string, string>;
  plan?: Plan;
  text: string;
  errors: string[];
  ms?: number;
  running: boolean;
};

function apply(turn: Turn, ev: StreamItem): Turn {
  switch (ev.type) {
    case "agent":
      return turn.agents.includes(ev.name) ? turn : { ...turn, agents: [...turn.agents, ev.name] };
    case "call": {
      const call: ToolCall = {
        id: ev.id || `${ev.name}-${turn.calls.length}`,
        name: ev.name,
        args: (ev.args ?? {}) as Record<string, unknown>,
        author: ev.author,
        at: Date.now() - turn.startedAt,
      };
      return { ...turn, calls: [...turn.calls, call] };
    }
    case "result": {
      const i = turn.calls.findIndex((c) => (ev.id ? c.id === ev.id : c.name === ev.name && c.result === undefined));
      if (i < 0) return turn;
      const calls = turn.calls.slice();
      calls[i] = { ...calls[i], result: ev.result };
      return { ...turn, calls };
    }
    case "output":
      return { ...turn, outputs: { ...turn.outputs, [ev.author]: ev.text } };
    case "plan":
      return { ...turn, plan: ev.plan };
    case "text":
      return { ...turn, text: turn.text + ev.text };
    case "error":
      return { ...turn, errors: [...turn.errors, ev.message] };
    case "done":
      return { ...turn, ms: ev.ms };
  }
}

const USER_KEY = "planb:user";

/** One id per browser, so remembered preferences follow the traveller. Storage can be blocked: fall back to a fresh id. */
function browserUserId() {
  try {
    const existing = localStorage.getItem(USER_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(USER_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function usePlanB() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const session = useRef<string | null>(null);
  const user = useRef<string | null>(null);
  const busy = turns.some((t) => t.running);

  const send = useCallback(
    async (message: string, opts?: { voice?: boolean }) => {
      const text = message.trim();
      if (!text || busy) return;
      session.current ??= crypto.randomUUID();
      user.current ??= browserUserId();
      const idx = turns.length;
      setTurns((ts) => [...ts, { message: text, voice: Boolean(opts?.voice), startedAt: Date.now(), calls: [], agents: [], outputs: {}, errors: [], text: "", running: true }]);
      const update = (f: (t: Turn) => Turn) => startTransition(() => setTurns((ts) => ts.map((t, i) => (i === idx ? f(t) : t))));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, sessionId: session.current, userId: user.current }),
        });
        if (!res.ok || !res.body) throw new Error((await res.text()) || `Request failed (${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          const events = lines.filter((l) => l.trim()).map((l) => JSON.parse(l) as StreamItem);
          if (events.length) update((t) => events.reduce(apply, t));
        }
      } catch (e) {
        update((t) => ({ ...t, errors: [...t.errors, (e as Error).message] }));
      }
      update((t) => ({ ...t, running: false }));
    },
    [busy, turns.length],
  );

  /** Back to the start; a new conversation (preferences stay with this browser). */
  const reset = useCallback(() => {
    if (busy) return;
    session.current = null;
    setTurns([]);
  }, [busy]);

  return { turns, busy, send, reset };
}
