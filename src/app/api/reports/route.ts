// Recent community reports, for the live ticker (what other travellers saw, before the official feeds).
import { connection } from "next/server";
import { recentReports } from "@/lib/reports";

export async function GET() {
  await connection(); // always fresh: reports arrive any second
  const now = Date.now();
  const seen = new Set<string>();
  const reports = recentReports(6)
    .filter((r) => {
      const key = `${r.where.toLowerCase()}|${r.lines.join(",")}`; // the same problem reported again: show the newest once
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map((r) => ({ where: r.where, what: r.what, lines: r.lines, minutesAgo: Math.max(0, Math.round((now - Date.parse(r.at)) / 60_000)) }));
  return Response.json({ reports }, { headers: { "Cache-Control": "no-store" } });
}
