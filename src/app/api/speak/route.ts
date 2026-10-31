// Reads a plan aloud with Gemini TTS (Vertex AI). Returns audio/wav.
import { GoogleGenAI, Modality } from "@google/genai";
import { isRateLimited } from "@/lib/rate-limit";

const TTS_MODEL = process.env.PLANB_TTS_MODEL || "gemini-3.8-flash-tts";
const MAX_CHARS = 700;

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ httpOptions: { retryOptions: { attempts: 2 }, timeout: 30_000 } }));

export async function POST(request: Request) {
  if (isRateLimited(request, "speak")) return new Response("Too many requests", { status: 429 });
  const { text } = (await request.json()) as { text?: string };
  if (!text?.trim()) return new Response("text is required", { status: 400 });

  const res = await ai().models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: "user", parts: [{ text: text.slice(0, MAX_CHARS) }] }],
    config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
  });
  const audio = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!audio?.data) return new Response("No audio returned", { status: 502 });
  return new Response(Buffer.from(audio.data, "base64"), {
    headers: { "Content-Type": audio.mimeType || "audio/wav", "Cache-Control": "no-store" },
  });
}
