// Voice to text with Gemini, primed for London transport names (browser speech recognition hears "Lee" as "Leigh").
// The page sends a short 16 kHz mono WAV.
import { GoogleGenAI } from "@google/genai";
import { isRateLimited } from "@/lib/rate-limit";

const MODEL = process.env.PLANB_TRANSCRIBE_MODEL || "gemini-3.8-flash";
const MAX_BYTES = 3_000_000; // about 90 s of 16 kHz mono audio

const PROMPT = `Transcribe this voice message from a traveller in London, word for word, in British English.
It is about London transport. Station and place names are likely, for example: Lee, Lewisham, London Bridge, Hither Green,
Blackheath, Greenwich, Canary Wharf, Stratford, Liverpool Street, Old Street, Bank, Hoxton, Encode Hub, Pitfield Street.
When the audio fits one of these, use that spelling ("Lee", not "Leigh"; "London Bridge", not "bridges").
Return only the transcript, nothing else. If there is no speech, return an empty string.`;

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ httpOptions: { retryOptions: { attempts: 2 }, timeout: 30_000 } }));

export async function POST(request: Request) {
  if (isRateLimited(request, "speak")) return new Response("Too many requests", { status: 429 });
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("audio/")) return new Response("Send audio (audio/wav)", { status: 415 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return new Response("Audio is empty or too long", { status: 413 });

  const res = await ai().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: PROMPT }, { inlineData: { mimeType: type.split(";")[0], data: bytes.toString("base64") } }] }],
    config: { temperature: 0 },
  });
  return Response.json({ text: (res.text ?? "").trim() });
}
