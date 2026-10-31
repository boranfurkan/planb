// Runs the Plan B pipeline outside Next.js and prints every event with a timestamp.
import { getFunctionCalls, getFunctionResponses } from "@google/adk";
import { APP_NAME, runner } from "../src/lib/agent";
const msg = process.argv[2] || "I am at Lee station. Staff at the entrance say all trains are cancelled because of the wind. I need to be at Encode Hub (41 Pitfield St, N1 6DA) for a pitch by 13:45.";
(async () => {
  const sessionId = "cli-" + Date.now();
  await runner.sessionService.getOrCreateSession({ appName: APP_NAME, userId: "cli", sessionId });
  const t0 = Date.now();
  const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + "s";
  for await (const ev of runner.runAsync({ userId: "cli", sessionId, newMessage: { role: "user", parts: [{ text: msg }] } })) {
    const a = ev.author;
    if (ev.errorCode || ev.errorMessage) console.log(ts(), a, "ERROR", ev.errorCode, ev.errorMessage?.slice(0, 300));
    for (const c of getFunctionCalls(ev)) console.log(ts(), a, "->", c.name, JSON.stringify(c.args).slice(0, c.name === "present_plan" ? 4000 : 160));
    for (const r of getFunctionResponses(ev)) console.log(ts(), a, "<-", r.name, JSON.stringify(r.response).slice(0, 120));
    const text = (ev.content?.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join("");
    if (text.trim()) console.log(ts(), a, "TEXT", text.slice(0, 300).replace(/\s+/g, " "));
    if (ev.actions?.escalate) console.log(ts(), a, "ESCALATE");
  }
  console.log(ts(), "DONE");
  process.exit(0);
})();
