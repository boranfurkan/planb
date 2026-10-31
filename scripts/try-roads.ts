import { driveRoutes, roadDisruptions } from "../src/lib/roads";
(async () => {
  // Blackheath village -> The O2, with a crash reported on Shooters Hill Road (A2) near the Blackwall approach
  const from = { lat: 51.4658, lon: 0.0089 }, to = { lat: 51.503, lon: 0.0034 }, incident = { lat: 51.4741, lon: 0.0136 };
  const s = Date.now();
  const r = await driveRoutes(from, to, incident, 300);
  console.log("driveRoutes", Date.now() - s, "ms");
  for (const x of r.routes) console.log(" ", x.kind, x.minutes + "min", x.km + "km", "passesIncident=" + x.passesIncident, "clearance=" + x.clearanceM, x.via.join(" / "), x.path.length + "pts");
  const d = await roadDisruptions(incident, 2000);
  console.log("roadDisruptions:", JSON.stringify(d).slice(0, 300));
})();
