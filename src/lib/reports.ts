// Community reports: what travellers saw, shared with the next traveller.
// Process-wide on purpose (one Cloud Run instance serves everyone); it holds no per-request data.

export type Report = { where: string; lines: string[]; what: string; at: string };

const store = globalThis as unknown as { __planbReports?: Report[] };
const reports = (store.__planbReports ??= []);
const MAX_REPORTS = 200;

export function addReport(r: Omit<Report, "at">) {
  reports.unshift({ ...r, at: new Date().toISOString() });
  reports.splice(MAX_REPORTS);
}

export function recentReports(hours = 6) {
  const since = Date.now() - hours * 3_600_000;
  return reports.filter((r) => Date.parse(r.at) >= since);
}
