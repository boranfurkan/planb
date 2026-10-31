"use client";
// Dark London map: where you are, the stations the problem knocks out, the escape hubs and where you're going.
// Loaded with next/dynamic (no SSR): Leaflet needs the browser.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import type { LatLon } from "@/lib/plan-types";
import { shortStation } from "./format";

export type MapData = { origin?: LatLon; destination?: LatLon; hubs: LatLon[]; affected: LatLon[] };

const LONDON: L.LatLngTuple = [51.505, -0.09];

const pin = (cls: string, html: string) => L.divIcon({ className: "", html: `<div class="pb-pin ${cls}">${html}</div>`, iconSize: [0, 0] });

export default function JourneyMap({ data }: { data: MapData }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  // A primitive dependency: redraw only when the points change.
  const key = useMemo(() => JSON.stringify(data), [data]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView(LONDON, 11);
    // OpenStreetMap tiles, darkened in CSS (.pb-dark-tiles): no API key needed.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: "pb-dark-tiles",
    }).addTo(m);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    const d = JSON.parse(key) as MapData;
    g.clearLayers();
    const pts: L.LatLngTuple[] = [];

    for (const s of d.affected) {
      L.marker([s.lat, s.lon], { icon: pin("pb-pin-broken", "✕") })
        .bindTooltip(`${shortStation(s.name)}: hit`, { direction: "top", className: "pb-tip" })
        .addTo(g);
      pts.push([s.lat, s.lon]);
    }
    if (d.origin) {
      for (const h of d.hubs) {
        L.polyline(
          [
            [d.origin.lat, d.origin.lon],
            [h.lat, h.lon],
          ],
          { color: "#fbbf24", weight: 3, dashArray: "6 8", opacity: 0.9 },
        ).addTo(g);
      }
    }
    if (d.destination && d.hubs[0]) {
      L.polyline(
        [
          [d.hubs[0].lat, d.hubs[0].lon],
          [d.destination.lat, d.destination.lon],
        ],
        { color: "#34d399", weight: 3, opacity: 0.8 },
      ).addTo(g);
    }
    d.hubs.forEach((h, i) => {
      L.marker([h.lat, h.lon], { icon: pin("pb-pin-hub", i === 0 ? "★" : "◆") })
        .bindTooltip(shortStation(h.name), { permanent: i === 0, direction: "right", className: "pb-tip pb-tip-hub" })
        .addTo(g);
      pts.push([h.lat, h.lon]);
    });
    if (d.origin) {
      L.marker([d.origin.lat, d.origin.lon], { icon: pin("pb-pin-origin", "") })
        .bindTooltip(`You: ${shortStation(d.origin.name)}`, { permanent: true, direction: "left", className: "pb-tip" })
        .addTo(g);
      pts.push([d.origin.lat, d.origin.lon]);
    }
    if (d.destination) {
      L.marker([d.destination.lat, d.destination.lon], { icon: pin("pb-pin-dest", "⚑") })
        .bindTooltip(d.destination.name.split(",")[0], { permanent: true, direction: "right", className: "pb-tip pb-tip-dest" })
        .addTo(g);
      pts.push([d.destination.lat, d.destination.lon]);
    }
    if (pts.length > 1) m.flyToBounds(L.latLngBounds(pts).pad(0.25), { duration: 1.2 });
    else if (pts.length === 1) m.flyTo(pts[0], 14, { duration: 1.2 });
  }, [key]);

  return <div ref={el} className="h-full w-full" role="img" aria-label="Map of your situation: you, the stations hit, escape hubs and your destination" />;
}
