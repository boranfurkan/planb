import { findPlace, nearbyStations, lineStatus, planJourney, taxiEstimate, arrivals } from "../src/lib/tfl";
const t = async (label: string, f: () => Promise<unknown>) => { const s = Date.now(); try { console.log(`\n== ${label} (${Date.now()-s}ms)`); console.log(JSON.stringify(await f()).slice(0, 900)); } catch (e) { console.log("ERR", (e as Error).message); } };
(async () => {
  await t("findPlace Lee station", () => findPlace("Lee station"));
  await t("findPlace Encode Hub", () => findPlace("Encode Hub"));
  await t("findPlace N1 6DA", () => findPlace("41 Pitfield St, N1 6DA"));
  await t("nearby Lee avoid southeastern", () => nearbyStations(51.4497, 0.0135, 3000, ["southeastern"]));
  await t("status", () => lineStatus(["southeastern", "dlr", "northern"]));
  await t("journey", () => planJourney({ from: "51.4497,0.0135", to: "51.5287,-0.0838", avoidModes: ["national-rail"] }));
  await t("taxi Lee->Lewisham", () => taxiEstimate({ lat: 51.4497, lon: 0.0135 }, { lat: 51.4657, lon: -0.0142 }));
  await t("arrivals Lewisham DLR", () => arrivals("940GZZDLLEW"));
})();
