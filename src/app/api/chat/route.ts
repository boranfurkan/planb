// Runs the Plan B agent for one message and streams what it does as NDJSON lines.
import { getFunctionCalls, getFunctionResponses } from "@google/adk";
import { APP_NAME, runner } from "@/lib/agent";
import type { Plan, StreamItem } from "@/lib/plan-types";
import { isRateLimited } from "@/lib/rate-limit";

const short = (v: unknown, n = 1500) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
};

export async function POST(request: Request) {
  if (isRateLimited(request)) return new Response("Too many runs from you in the last 10 minutes. Try again shortly.", { status: 429 });
  const body = (await request.json()) as { message?: string; sessionId?: string; userId?: string };
  const message = body.message ?? "";
  const sessionId = body.sessionId ?? "";
  // One id per browser, so remembered preferences follow the traveller; anything odd falls back to a shared id.
  const userId = /^[\w-]{8,64}$/.test(body.userId ?? "") ? (body.userId as string) : "traveller";
  if (!message?.trim() || !sessionId) return new Response("message and sessionId are required", { status: 400 });

  await runner.sessionService.getOrCreateSession({ appName: APP_NAME, userId, sessionId });
  const started = Date.now();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (item: StreamItem) => controller.enqueue(enc.encode(JSON.stringify(item) + "\n"));
      let lastAuthor = "";
      try {
        for await (const event of runner.runAsync({
          userId,
          sessionId,
          newMessage: { role: "user", parts: [{ text: message }] },
          abortSignal: request.signal,
        })) {
          const author = event.author ?? "";
          if (author && author !== "user" && author !== lastAuthor) {
            lastAuthor = author;
            send({ type: "agent", name: author });
          }
          if (event.errorCode || event.errorMessage) {
            send({ type: "error", message: `${author}: ${event.errorCode ?? ""} ${event.errorMessage ?? ""}`.slice(0, 400) });
          }
          for (const c of getFunctionCalls(event)) {
            if (c.name === "present_plan") send({ type: "plan", plan: c.args as Plan });
            else send({ type: "call", id: c.id ?? "", name: c.name ?? "", args: c.args, author });
          }
          for (const r of getFunctionResponses(event)) {
            if (r.name === "present_plan") continue;
            send({ type: "result", id: r.id ?? "", name: r.name ?? "", result: short(r.response, 12000), author });
          }
          const text = (event.content?.parts ?? [])
            .filter((p) => p.text && !p.thought)
            .map((p) => p.text)
            .join("");
          if (text.trim() && author !== "user") {
            if (author === "presenter") send({ type: "text", text });
            else send({ type: "output", author, text: short(text, 3000) });
          }
        }
      } catch (e) {
        send({ type: "error", message: (e as Error).message.slice(0, 500) });
      }
      send({ type: "done", ms: Date.now() - started });
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
}
