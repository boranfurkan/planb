"use client";
// Full-bleed dark London map behind the workspace: you, the stations your report knocks out, the escape hub,
// the incident (drivers) and, once planned, the route drawn in. Loaded with next/dynamic (no SSR): Leaflet needs the browser.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import type { LatLon } from "@/lib/plan-types";
import { type MapRoute, shortStation } from "./format";

export type MapStage = "origin" | "scan" | "route";
export type MapData = {
  stage: MapStage;
  origin?: LatLon;
  destination?: LatLon;
  hubs: (LatLon & { workingLines?: string[] })[];
  affected: LatLon[];
  incident?: LatLon;
  routes: MapRoute[];
};

const LONDON: L.LatLngTuple = [51.495, -0.06];
// OpenStreetMap tiles (no API key), turned into a dark, quiet basemap.
const DARK_TILES = "invert(1) hue-rotate(180deg) brightness(0.78) contrast(1.05) saturate(0.25)";
const TEAL = "#3ec9c1";
const AMBER = "#f5b24e";
const RED = "#ff5a6e";
const GREEN = "#5fd49a";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const chip = (text: string, color: string, sub?: string, left?: boolean) =>
  `<div style="transform:translate(${left ? "calc(-100% - 14px)" : "14px"},-50%);white-space:nowrap;font:500 12px var(--font-geist-sans),system-ui;color:${color};padding:5px 10px;border-radius:999px;background:rgba(10,10,13,0.8);border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,0.4)">${esc(text)}${
    sub ? `<span style="color:#8a8d95;margin-left:6px">${esc(sub)}</span>` : ""
  }</div>`;
const pin = (dot: string, label: string) =>
  `<div style="position:relative;width:0;height:0"><div style="position:absolute;transform:translate(-50%,-50%)">${dot}</div><div style="position:absolute;top:0;left:0">${label}</div></div>`;
const icon = (html: string) => L.divIcon({ html, className: "", iconSize: [0, 0] });

const DOT = {
  you: `<div style="width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 0 0 6px rgba(255,255,255,0.15),0 0 24px rgba(255,255,255,0.7)"></div>`,
  dest: `<div style="width:16px;height:16px;border-radius:50%;border:2px solid #fff;background:#0a0a0c"></div>`,
  hit: `<div style="width:10px;height:10px;border-radius:50%;background:${RED};box-shadow:0 0 14px ${RED}"></div>`,
  hub: `<div style="width:14px;height:14px;transform:rotate(45deg);border-radius:3px;background:${AMBER};box-shadow:0 0 22px ${AMBER}"></div>`,
  incident: `<div style="width:18px;height:18px;border-radius:50%;background:${RED};color:#fff;display:grid;place-items:center;font:700 12px system-ui;box-shadow:0 0 0 6px rgba(255,90,110,0.18),0 0 22px ${RED}">!</div>`,
};

function interpolate(a: LatLon, b: LatLon, n = 14): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => [a.lat + ((b.lat - a.lat) * i) / n, a.lon + ((b.lon - a.lon) * i) / n]);
}

type Segment = { pts: [number, number][]; color: string; dash?: string; weight?: number; opacity?: number };

function segments(d: MapData): Segment[] {
  if (d.routes.length) {
    return d.routes.map((r) =>
      r.blocked ? { pts: r.path, color: RED, dash: "4 8", opacity: 0.85 } : { pts: r.path, color: r.best ? GREEN : "#9a9ca3", weight: r.best ? 4 : 2, opacity: r.best ? 0.95 : 0.4 },
    );
  }
  if (!d.origin || !d.destination) return [];
  const hub = d.hubs[0];
  return hub
    ? [
        { pts: interpolate(d.origin, hub, 8), color: AMBER, dash: "2 8" },
        { pts: interpolate(hub, d.destination, 24), color: TEAL },
      ]
    : [{ pts: interpolate(d.origin, d.destination, 24), color: TEAL }];
}

export default function JourneyMap({ data, padLeft, padRight }: { data: MapData; padLeft: number; padRight: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const route = useRef<L.LayerGroup | null>(null);
  const drawTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const key = useMemo(() => JSON.stringify(data), [data]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, scrollWheelZoom: false }).setView(LONDON, 11.5);
    m.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(m);
    const tiles = m.getPane("tilePane");
    if (tiles) tiles.style.filter = DARK_TILES;
    const ac = m.attributionControl.getContainer();
    if (ac) Object.assign(ac.style, { background: "transparent", color: "#55575e", fontSize: "10px" });
    map.current = m;
    markers.current = L.layerGroup().addTo(m);
    route.current = L.layerGroup().addTo(m);
    return () => {
      clearInterval(drawTimer.current);
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const mk = markers.current;
    const rt = route.current;
    if (!m || !mk || !rt) return;
    const d = JSON.parse(key) as MapData;
    mk.clearLayers();
    const pts: L.LatLngTuple[] = [];
    const add = (p: LatLon, html: string) => {
      L.marker([p.lat, p.lon], { icon: icon(html), keyboard: false }).addTo(mk);
      pts.push([p.lat, p.lon]);
    };

    if (d.stage !== "origin") {
      for (const s of d.affected.slice(0, 4)) add(s, pin(DOT.hit, chip(shortStation(s.name), "#ff9aa6", "hit", true)));
      d.hubs
        .slice(0, 1)
        .forEach((h) => add(h, pin(DOT.hub, chip(shortStation(h.name), "#f7c87a", h.workingLines?.length ? `${h.workingLines[0].toUpperCase()} running` : "still running"))));
    }
    if (d.incident) add(d.incident, pin(DOT.incident, chip("Reported incident", "#ff9aa6")));
    if (d.origin) add(d.origin, pin(DOT.you, chip("You", "#fff", shortStation(d.origin.name.replace(/^Your location: /, "")).split(",")[0], true)));
    if (d.destination) add(d.destination, pin(DOT.dest, chip(d.destination.name.split(",")[0], "#fff")));

    rt.clearLayers();
    clearInterval(drawTimer.current);
    if (d.stage === "route") {
      const segs = segments(d);
      for (const s of segs) for (const p of s.pts) pts.push(p);
      const lines = segs.map((s) => ({
        s,
        glow: L.polyline([], { color: s.color, weight: (s.weight ?? 3) + 7, opacity: 0.14, lineCap: "round" }).addTo(rt),
        line: L.polyline([], { color: s.color, weight: s.weight ?? 3, opacity: s.opacity ?? 0.95, dashArray: s.dash, lineCap: "round" }).addTo(rt),
      }));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let si = 0;
      let pi = 0;
      const step = () => {
        const cur = lines[si];
        if (!cur) return clearInterval(drawTimer.current);
        const p = cur.s.pts[pi];
        cur.glow.addLatLng(p);
        cur.line.addLatLng(p);
        if (++pi >= cur.s.pts.length) {
          si++;
          pi = 0;
        }
      };
      if (reduce) while (lines[si]) step();
      else drawTimer.current = setInterval(step, 35);
    }

    const h = m.getSize().y || 400;
    const pad = { paddingTopLeft: [padLeft, Math.min(90, h * 0.14)] as L.PointTuple, paddingBottomRight: [padRight, Math.min(110, h * 0.16)] as L.PointTuple };
    if (pts.length > 1) m.flyToBounds(L.latLngBounds(pts), { ...pad, duration: 1.4, maxZoom: d.stage === "scan" ? 14 : 15 });
    else if (pts.length === 1) m.flyTo(pts[0], 13, { duration: 1.2 });
  }, [key, padLeft, padRight]);

  return <div ref={el} className="absolute inset-0" role="img" aria-label="Map: where you are, the stations hit, the escape hub, and your route" />;
}
