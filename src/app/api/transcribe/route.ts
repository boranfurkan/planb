// Voice to text with Gemini, primed for London transport names (browser speech recognition hears "Lee" as "Leigh").
// The page sends a short 16 kHz mono WAV.
import { GoogleGenAI } from "@google/genai";
import { isRateLimited } from "@/lib/rate-limit";

// The lightweight model first: it is fast even when Gemini is busy. The full model is the fallback.
const MODELS = [process.env.PLANB_TRANSCRIBE_MODEL || "gemini-3.5-flash-lite", "gemini-3.8-flash"];
const MAX_BYTES = 3_000_000; // about 90 s of 16 kHz mono audio

const PROMPT = `Transcribe this voice message from a traveller in London, word for word, in British English.
It is about London transport. Station and place names are likely, for example: Lee, Lewisham, London Bridge, Hither Green,
Blackheath, Greenwich, Canary Wharf, Stratford, Liverpool Street, Old Street, Bank, Hoxton, Encode Hub, Pitfield Street.
When the audio fits one of these, use that spelling ("Lee", not "Leigh"; "London Bridge", not "bridges").
Return only the transcript, nothing else. If there is no speech, return an empty string.`;

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ httpOptions: { retryOptions: { attempts: 1 }, timeout: 15_000 } }));

export async function POST(request: Request) {
  if (isRateLimited(request, "speak")) return new Response("Too many requests", { status: 429 });
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("audio/")) return new Response("Send audio (audio/wav)", { status: 415 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return new Response("Audio is empty or too long", { status: 413 });

  const parts = [{ text: PROMPT }, { inlineData: { mimeType: type.split(";")[0], data: bytes.toString("base64") } }];
  for (const model of MODELS) {
    try {
      const res = await ai().models.generateContent({ model, contents: [{ role: "user", parts }], config: { temperature: 0 } });
      const text = (res.text ?? "").trim();
      if (text) return Response.json({ text, model });
    } catch {
      /* try the next model */
    }
  }
  return Response.json({ text: "" });
}
