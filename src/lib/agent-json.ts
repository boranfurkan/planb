// Agents reply with JSON, sometimes wrapped in a Markdown code fence. Shared by the server and the page.
const FENCE = /^```(?:json)?\s*|\s*```$/g;

export function parseAgentJson<T = Record<string, unknown>>(text: unknown): T | undefined {
  if (typeof text !== "string" || !text.trim()) return undefined;
  try {
    return JSON.parse(text.trim().replace(FENCE, "")) as T;
  } catch {
    return undefined;
  }
}
