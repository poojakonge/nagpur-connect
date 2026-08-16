/* ════════════════════════════════════════════════════════
   Admin Incident Map — Real Data
   - Real incidents from TiDB (with lat/lng) as severity markers
   - 178 GeoJSON facilities as department markers
   - 10 NMC zone boundaries as polygons
   - Style switcher: Streets | Satellite | Topo | Monochrome
   ════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect, useCallback } from "react";
import Map, {
  Marker,
  NavigationControl,
  ScaleControl,
  Popup,
  Source,
  Layer,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";

/* ─── Map styles ─── */
const API_KEY = process.env.NEXT_PUBLIC_MAPTILER_API_KEY ?? "";

const MAP_STYLES = [
  { id: "streets",   label: "Streets",     icon: "🗺️", url: `https://api.maptiler.com/maps/streets-v2/style.json?key=${API_KEY}` },
  { id: "satellite", label: "Satellite",   icon: "🛰️", url: `https://api.maptiler.com/maps/satellite/style.json?key=${API_KEY}` },
  { id: "topo",      label: "Topo",        icon: "⛰️", url: `https://api.maptiler.com/maps/topo-v2/style.json?key=${API_KEY}` },
  { id: "mono",      label: "Monochrome",  icon: "◑",  url: `https://api.maptiler.com/maps/dataviz-light/style.json?key=${API_KEY}` },
] as const;

const NAGPUR = { longitude: 79.0882, latitude: 21.1458, zoom: 12 };

/* ─── Severity colors ─── */
const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH:     "#f97316",
  MEDIUM:   "#eab308",
  LOW:      "#22c55e",
};

/* ─── Department type → color ─── */
const DEPT_COLOR: Record<string, string> = {
  police:            "#3b82f6",
  fire_brigade:      "#ef4444",
  water_supply:      "#06b6d4",
  road_maintenance:  "#f59e0b",
  waste_management:  "#10b981",
  electricity:       "#8b5cf6",
  environment:       "#22c55e",
  traffic_management:"#f97316",
  municipal_corp:    "#6366f1",
};

/* ─── Types ─── */
interface IncidentMarker {
  id: string;
  publicReference: string;
  title: string | null;
  severity: string | null;
  status: string;
  latitude: number;
  longitude: number;
  isEmergency: boolean;
  departments: string[];
}

interface FacilityMarker {
  id: string;
  name: string;
  departmentType: string;
  departmentName: string;
  facilityType: string;
  latitude: number;
  longitude: number;
  address?: string;
  contactNumber?: string;
  emergencyNumber?: string;
}

type ActivePopup =
  | { kind: "incident"; data: IncidentMarker }
  | { kind: "facility"; data: FacilityMarker };

type LayerFilter = "incidents" | "facilities" | "all";

export default function AdminMapPage() {
  const [styleId, setStyleId] = useState("streets");
  const [incidents, setIncidents] = useState<IncidentMarker[]>([]);
  const [facilities, setFacilities] = useState<FacilityMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<ActivePopup | null>(null);
  const [layerFilter, setLayerFilter] = useState<LayerFilter>("all");
  const [deptFilter, setDeptFilter] = useState<string>("ALL");

  const currentStyle = MAP_STYLES.find((s) => s.id === styleId)!;

  /* Load real map data */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/map-data");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setIncidents(data.incidents || []);
            setFacilities(data.facilities || []);
          }
        }
      } catch (err) {
        console.error("[AdminMap] Failed to load map data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* Derived filtered sets */
  const visibleIncidents =
    layerFilter === "facilities" ? [] : incidents;

  const visibleFacilities =
    layerFilter === "incidents"
      ? []
      : deptFilter === "ALL"
      ? facilities
      : facilities.filter((f) => f.departmentType === deptFilter);

  /* Unique department types for filter */
  const deptTypes = Array.from(new Set(facilities.map((f) => f.departmentType))).sort();

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider bg-surface-0 flex-shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="text-base font-bold">Incident & Facilities Map</h1>
          {!loading && (
            <p className="text-xs text-text-tertiary">
              {incidents.length} incidents · {visibleFacilities.length} facilities shown
            </p>
          )}
        </div>

        {/* Layer filter */}
        <div className="flex items-center gap-2">
          {(["all", "incidents", "facilities"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setLayerFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                layerFilter === f
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-text-tertiary hover:bg-surface-3"
              }`}
            >
              {f === "all" ? "All Layers" : f}
            </button>
          ))}
        </div>

        {/* Department filter (only when facilities visible) */}
        {layerFilter !== "incidents" && (
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="bg-surface-1 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="ALL">All Departments</option>
            {deptTypes.map((dt) => (
              <option key={dt} value={dt}>
                {dt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        )}

        {/* Style switcher */}
        <div className="flex items-center gap-1">
          {MAP_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyleId(s.id)}
              title={s.label}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                styleId === s.id
                  ? "bg-accent text-white shadow-sm"
                  : "bg-surface-2 text-text-tertiary hover:bg-surface-3"
              }`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/70 z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
              <p className="text-sm text-text-tertiary">Loading map data...</p>
            </div>
          </div>
        )}

        <Map
          initialViewState={NAGPUR}
          mapStyle={currentStyle.url}
          style={{ width: "100%", height: "100%" }}
          maxBounds={[78.8, 20.9, 79.35, 21.45]}
          attributionControl={false}
          onClick={() => setPopup(null)}
        >
          <NavigationControl position="top-right" />
          <ScaleControl position="bottom-right" />

          {/* ─── Incident Markers ─── */}
          {visibleIncidents.map((inc) => {
            const color = SEVERITY_COLOR[inc.severity || ""] || "#6b7280";
            return (
              <Marker
                key={`inc-${inc.id}`}
                latitude={inc.latitude}
                longitude={inc.longitude}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setPopup({ kind: "incident", data: inc });
                }}
              >
                <div
                  title={inc.title || inc.publicReference}
                  style={{
                    width: inc.isEmergency ? 22 : 18,
                    height: inc.isEmergency ? 22 : 18,
                    borderRadius: "50%",
                    background: color,
                    border: `3px solid white`,
                    boxShadow: `0 0 0 2px ${color}, 0 2px 6px rgba(0,0,0,0.4)`,
                    cursor: "pointer",
                    animation: inc.isEmergency ? "pulse-ring 1.5s infinite" : "none",
                  }}
                />
              </Marker>
            );
          })}

          {/* ─── Facility Markers ─── */}
          {visibleFacilities.map((fac) => {
            const color = DEPT_COLOR[fac.departmentType] || "#6b7280";
            return (
              <Marker
                key={`fac-${fac.id}`}
                latitude={fac.latitude}
                longitude={fac.longitude}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setPopup({ kind: "facility", data: fac });
                }}
              >
                <div
                  title={fac.name}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "3px",
                    background: color,
                    border: "2px solid white",
                    boxShadow: `0 1px 4px rgba(0,0,0,0.35)`,
                    cursor: "pointer",
                  }}
                />
              </Marker>
            );
          })}

          {/* ─── Popups ─── */}
          {popup?.kind === "incident" && (
            <Popup
              latitude={popup.data.latitude}
              longitude={popup.data.longitude}
              onClose={() => setPopup(null)}
              closeButton={true}
              closeOnClick={false}
              anchor="bottom"
              maxWidth="280px"
            >
              <div className="p-2 space-y-1.5 min-w-[220px]">
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                    style={{ background: SEVERITY_COLOR[popup.data.severity || ""] || "#6b7280" }}
                  >
                    {popup.data.severity || "—"}
                  </span>
                  <span className="text-[10px] font-mono text-gray-500">
                    {popup.data.publicReference}
                  </span>
                  {popup.data.isEmergency && (
                    <span className="text-[10px] text-red-500 font-bold">🚨</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-800 leading-snug">
                  {popup.data.title || "Untitled"}
                </p>
                {popup.data.departments.length > 0 && (
                  <p className="text-[11px] text-gray-500">
                    {popup.data.departments.join(" · ")}
                  </p>
                )}
                <Link
                  href={`/admin/incidents/${popup.data.publicReference}`}
                  className="inline-block mt-1 text-[11px] text-blue-600 hover:underline font-medium"
                  onClick={() => setPopup(null)}
                >
                  View full report →
                </Link>
              </div>
            </Popup>
          )}

          {popup?.kind === "facility" && (
            <Popup
              latitude={popup.data.latitude}
              longitude={popup.data.longitude}
              onClose={() => setPopup(null)}
              closeButton={true}
              closeOnClick={false}
              anchor="bottom"
              maxWidth="280px"
            >
              <div className="p-2 space-y-1.5 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ background: DEPT_COLOR[popup.data.departmentType] || "#6b7280" }}
                  />
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    {popup.data.departmentName}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-800 leading-snug">
                  {popup.data.name}
                </p>
                <p className="text-[11px] text-gray-400">{popup.data.facilityType}</p>
                {popup.data.address && (
                  <p className="text-[11px] text-gray-500 leading-snug">{popup.data.address}</p>
                )}
                {popup.data.contactNumber && (
                  <a
                    href={`tel:${popup.data.contactNumber.replace(/[^+\d]/g, "")}`}
                    className="text-[11px] text-blue-600 hover:underline block"
                  >
                    📞 {popup.data.contactNumber}
                  </a>
                )}
                {popup.data.emergencyNumber && (
                  <a
                    href={`tel:${popup.data.emergencyNumber.split("/")[0].trim().replace(/[^+\d]/g, "")}`}
                    className="text-[11px] text-red-600 hover:underline font-semibold block"
                  >
                    🚨 {popup.data.emergencyNumber}
                  </a>
                )}
              </div>
            </Popup>
          )}
        </Map>

        {/* ─── Legend ─── */}
        <div className="absolute bottom-8 left-4 bg-surface-0/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-lg text-xs space-y-2 z-10">
          <p className="font-bold text-text-primary text-[10px] uppercase tracking-wider mb-1">Legend</p>

          {layerFilter !== "facilities" && (
            <div className="space-y-1">
              <p className="text-[10px] text-text-tertiary font-semibold">INCIDENTS (circles)</p>
              {Object.entries(SEVERITY_COLOR).map(([sev, color]) => (
                <div key={sev} className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white" style={{ background: color, boxShadow: `0 0 0 1.5px ${color}` }} />
                  <span className="text-text-tertiary capitalize">{sev.toLowerCase()}</span>
                </div>
              ))}
            </div>
          )}

          {layerFilter !== "incidents" && (
            <div className="space-y-1 mt-1">
              <p className="text-[10px] text-text-tertiary font-semibold">FACILITIES (squares)</p>
              {Object.entries(DEPT_COLOR).slice(0, 5).map(([dept, color]) => (
                <div key={dept} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm border border-white" style={{ background: color }} />
                  <span className="text-text-tertiary">{dept.replace(/_/g, " ")}</span>
                </div>
              ))}
              {Object.keys(DEPT_COLOR).length > 5 && (
                <p className="text-[10px] text-text-tertiary">+ {Object.keys(DEPT_COLOR).length - 5} more</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Emergency animation */}
      <style>{`
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.7), 0 2px 6px rgba(0,0,0,0.4); }
          70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0), 0 2px 6px rgba(0,0,0,0.4); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0), 0 2px 6px rgba(0,0,0,0.4); }
        }
      `}</style>
    </div>
  );
}
