/* ════════════════════════════════════════════════════════
   Admin Incident & Facilities Map — OpenStreetMap (OSM)
   - Constrained strictly to Nagpur (1.5x Metro Jurisdiction)
   - Default Nagpur Center (21.1458° N, 79.0882° E)
   - Live incident triage markers from TiDB
   - 178 Municipal GeoJSON facilities & 10 NMC zone polygons
   - Rich interactive legends, search flight, and quick locality navigation
   ════════════════════════════════════════════════════════ */

"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { SearchIcon, MapIcon, ShieldIcon, BuildingIcon } from "@/components/ui/icons";
import {
  NAGPUR_CENTER,
  type IncidentMarkerData,
  type FacilityMarkerData,
  type ZoneData,
} from "@/components/admin/osm-map-types";

// Dynamic import with SSR disabled to prevent Leaflet window errors
const OsmIncidentMap = dynamic(
  () => import("@/components/admin/osm-incident-map"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-surface-1">
        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-bold text-text-primary">Loading Nagpur Incident Map...</p>
        <p className="text-xs text-text-tertiary">Centering on Nagpur (21.1458° N, 79.0882° E)</p>
      </div>
    ),
  }
);

/* ─── OpenStreetMap Tile Providers ─── */
const TILE_PROVIDERS = [
  {
    id: "osm",
    label: "OpenStreetMap",
    icon: "🗺️",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: "carto-light",
    label: "Clean Light",
    icon: "☀️",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
  },
  {
    id: "carto-dark",
    label: "Dark Matter",
    icon: "🌙",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
  },
  {
    id: "satellite",
    label: "Satellite",
    icon: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics",
  },
  {
    id: "topo",
    label: "Topographic",
    icon: "⛰️",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM',
  },
];

/* ─── Key Nagpur Localities for Quick Jump ─── */
const NAGPUR_LOCALITIES = [
  { name: "Zero Mile / Sitabuldi (Center)", coords: [21.1458, 79.0882] as [number, number] },
  { name: "Dharampeth / Ramdaspeth", coords: [21.1394, 79.0645] as [number, number] },
  { name: "Sadar / Civil Lines", coords: [21.1610, 79.0805] as [number, number] },
  { name: "Laxmi Nagar / Bajaj Nagar", coords: [21.1189, 79.0621] as [number, number] },
  { name: "Wardhaman Nagar / Itwari", coords: [21.1523, 79.1245] as [number, number] },
  { name: "Medical Square / Hanuman Nagar", coords: [21.1275, 79.0963] as [number, number] },
  { name: "MIHAN / Nagpur Airport", coords: [21.0592, 79.0558] as [number, number] },
  { name: "Kalamna / Pardi", coords: [21.1689, 79.1567] as [number, number] },
];

export default function AdminMapPage() {
  const [selectedProvider, setSelectedProvider] = useState(TILE_PROVIDERS[0]);
  const [incidents, setIncidents] = useState<IncidentMarkerData[]>([]);
  const [facilities, setFacilities] = useState<FacilityMarkerData[]>([]);
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [loading, setLoading] = useState(true);

  // Layer toggles
  const [showIncidents, setShowIncidents] = useState(true);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showZones, setShowZones] = useState(true);

  // Filters
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  // Search & Navigation
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(NAGPUR_CENTER);
  const [showLegend, setShowLegend] = useState(true);
  const [showRecentFeed, setShowRecentFeed] = useState(true);

  /* Load map data from /api/admin/map-data */
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/admin/map-data");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setIncidents(data.incidents || []);
            setFacilities(data.facilities || []);
            setZones(data.zones || []);
          }
        }
      } catch (err) {
        console.error("[AdminMap] Error loading map data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  /* Search matching across incidents, facilities and zones */
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();

    const matchedIncidents = incidents
      .filter(
        (i) =>
          i.publicReference.toLowerCase().includes(q) ||
          (i.title && i.title.toLowerCase().includes(q))
      )
      .slice(0, 4)
      .map((i) => ({
        type: "incident" as const,
        id: i.id,
        title: i.publicReference,
        subtitle: i.title || "Reported incident",
        coords: [i.latitude, i.longitude] as [number, number],
      }));

    const matchedFacilities = facilities
      .filter((f) => f.name.toLowerCase().includes(q) || f.departmentName.toLowerCase().includes(q))
      .slice(0, 4)
      .map((f) => ({
        type: "facility" as const,
        id: f.id,
        title: f.name,
        subtitle: `${f.departmentName} · ${f.facilityType}`,
        coords: [f.latitude, f.longitude] as [number, number],
      }));

    return [...matchedIncidents, ...matchedFacilities];
  }, [searchQuery, incidents, facilities]);

  // Live Incident Counts
  const counts = useMemo(() => {
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const inc of incidents) {
      const s = inc.severity?.toUpperCase();
      if (s === "CRITICAL" || inc.isEmergency) critical++;
      else if (s === "HIGH") high++;
      else if (s === "MEDIUM") medium++;
      else if (s === "LOW") low++;
    }

    return {
      total: incidents.length,
      critical,
      high,
      medium,
      low,
      facilities: facilities.length,
      zones: zones.length,
    };
  }, [incidents, facilities, zones]);

  const handleRecenterNagpur = () => {
    setSelectedCoords([NAGPUR_CENTER[0] + (Math.random() * 0.00001), NAGPUR_CENTER[1]]);
  };

  return (
    <div className="relative w-full h-[calc(100vh-5rem)] flex flex-col overflow-hidden bg-slate-950 rounded-2xl border border-border shadow-2xl">
      {/* ─── Top Control Bar ─── */}
      <div className="z-10 bg-surface-0/95 backdrop-blur-md border-b border-border p-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
        {/* Left: Location Default Value & Search */}
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          {/* Default Nagpur Location Pill */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/20 rounded-xl text-xs font-semibold text-accent flex-shrink-0">
            <span className="animate-pulse">📍</span>
            <span>Nagpur City Command (21.1458° N, 79.0882° E)</span>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Nagpur incidents (NAG-2026...), facilities, or localities..."
              className="w-full pl-9 pr-4 py-2 bg-surface-1 border border-border rounded-xl text-xs sm:text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />

            {/* Live Search Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-0 border border-border rounded-xl shadow-2xl overflow-hidden z-50 divide-y divide-border">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedCoords(item.coords);
                      setSearchQuery("");
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-surface-1 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <p className="text-xs font-bold text-text-primary">{item.title}</p>
                      <p className="text-[11px] text-text-tertiary">{item.subtitle}</p>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-accent px-2 py-0.5 bg-accent/10 rounded-full">
                      {item.type} ↗
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Locality Jump Selector */}
          <select
            onChange={(e) => {
              const idx = parseInt(e.target.value, 10);
              if (!isNaN(idx) && NAGPUR_LOCALITIES[idx]) {
                setSelectedCoords(NAGPUR_LOCALITIES[idx].coords);
              }
            }}
            defaultValue=""
            className="bg-surface-1 border border-border rounded-xl px-3 py-2 text-xs font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 hidden sm:block"
          >
            <option value="" disabled>Jump to Nagpur Locality...</option>
            {NAGPUR_LOCALITIES.map((loc, idx) => (
              <option key={loc.name} value={idx}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Right: Tile Switcher & Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tile Selector */}
          <div className="flex items-center gap-1 bg-surface-1 border border-border p-1 rounded-xl">
            {TILE_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                onClick={() => setSelectedProvider(provider)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                  selectedProvider.id === provider.id
                    ? "bg-accent text-white shadow-sm font-bold"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
                title={provider.label}
              >
                <span>{provider.icon}</span>
                <span className="hidden md:inline">{provider.label}</span>
              </button>
            ))}
          </div>

          {/* Recenter on Nagpur */}
          <button
            onClick={handleRecenterNagpur}
            className="px-3 py-2 bg-surface-1 hover:bg-surface-2 border border-border rounded-xl text-xs font-bold text-text-primary transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Snap back to Nagpur center"
          >
            <span>🎯</span>
            <span className="hidden sm:inline">Center Nagpur</span>
          </button>

          {/* Toggle Legend Drawer */}
          <button
            onClick={() => setShowLegend(!showLegend)}
            className={`px-3 py-2 border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
              showLegend
                ? "bg-accent text-white border-accent"
                : "bg-surface-1 text-text-primary border-border hover:bg-surface-2"
            }`}
          >
            <span>📊</span>
            <span className="hidden sm:inline">Legend</span>
          </button>
        </div>
      </div>

      {/* ─── Main Map Container ─── */}
      <div className="relative flex-1 w-full h-full">
        <OsmIncidentMap
          tileUrl={selectedProvider.url}
          attribution={selectedProvider.attribution}
          incidents={incidents}
          facilities={facilities}
          zones={zones}
          showIncidents={showIncidents}
          showFacilities={showFacilities}
          showZones={showZones}
          severityFilter={severityFilter}
          statusFilter={statusFilter}
          departmentFilter={departmentFilter}
          selectedCoordinates={selectedCoords}
        />

        {/* ─── Floating Top-Left Layer Filter Pills ─── */}
        <div className="absolute top-4 left-4 z-10 flex flex-col sm:flex-row items-start sm:items-center gap-2 pointer-events-auto">
          <div className="bg-surface-0/90 backdrop-blur-md border border-border/80 p-1.5 rounded-2xl shadow-xl flex items-center gap-1 text-xs">
            <button
              onClick={() => setShowIncidents(!showIncidents)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                showIncidents ? "bg-accent text-white shadow-sm" : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              <span>🚨</span>
              <span>Incidents ({counts.total})</span>
            </button>

            <button
              onClick={() => setShowFacilities(!showFacilities)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                showFacilities ? "bg-accent text-white shadow-sm" : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              <span>🏢</span>
              <span>Facilities (178)</span>
            </button>

            <button
              onClick={() => setShowZones(!showZones)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                showZones ? "bg-accent text-white shadow-sm" : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              <span>📍</span>
              <span>10 NMC Zones</span>
            </button>

            <div className="w-[1px] h-4 bg-border mx-1" />

            <button
              onClick={() => setShowRecentFeed(!showRecentFeed)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                showRecentFeed ? "bg-rose-600 text-white shadow-sm" : "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span>Live Reports ({incidents.slice(0, 10).length})</span>
            </button>
          </div>
        </div>

        {/* ─── Floating Top 10 Recent Incident Triage Drawer ─── */}
        {showRecentFeed && (
          <div className="absolute top-16 left-4 z-10 w-80 sm:w-96 max-h-[calc(100vh-13rem)] bg-surface-0/95 backdrop-blur-md border border-border rounded-3xl p-3.5 shadow-2xl overflow-hidden flex flex-col pointer-events-auto animate-fadeIn">
            <div className="flex items-center justify-between border-b border-border pb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
                  Live Recent Reports (Top 10)
                </span>
              </div>
              <button
                onClick={() => setShowRecentFeed(false)}
                className="text-text-tertiary hover:text-text-primary text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pt-2.5 pr-1">
              {incidents.length === 0 && (
                <div className="text-center py-8 text-xs text-text-tertiary">
                  No active incidents recorded
                </div>
              )}
              {incidents.slice(0, 10).map((inc) => (
                <button
                  key={inc.id}
                  onClick={() => setSelectedCoords([inc.latitude, inc.longitude])}
                  className="w-full p-2.5 rounded-2xl bg-surface-1 hover:bg-accent/10 border border-border hover:border-accent/40 text-left transition-all group cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span className="text-[10px] font-mono font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-md">
                      {inc.publicReference}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        inc.severity === "CRITICAL" || inc.isEmergency
                          ? "bg-rose-500/20 text-rose-600 border border-rose-500/30"
                          : inc.severity === "HIGH"
                          ? "bg-orange-500/20 text-orange-600 border border-orange-500/30"
                          : inc.severity === "MEDIUM"
                          ? "bg-amber-500/20 text-amber-600 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-600 border border-emerald-500/30"
                      }`}
                    >
                      {inc.severity || "NORMAL"}
                    </span>
                  </div>

                  <p className="text-xs font-bold text-text-primary group-hover:text-accent line-clamp-1 leading-snug">
                    {inc.title}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-text-tertiary mt-1.5 pt-1 border-t border-border/50">
                    <span className="truncate max-w-[170px]">
                      📍 {inc.locationText || `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}`}
                    </span>
                    <span className="font-bold text-accent group-hover:underline flex items-center gap-0.5">
                      Locate on Map 🎯
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Floating Interactive Legend Panel ─── */}
        {showLegend && (
          <div className="absolute bottom-4 right-4 z-10 w-80 max-h-[80%] overflow-y-auto bg-surface-0/95 backdrop-blur-md border border-border rounded-3xl p-4 shadow-2xl space-y-4 animate-fadeIn pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-text-primary">
                  Nagpur Incident Live Triage
                </h3>
              </div>
              <span className="text-[11px] font-mono font-bold text-accent">
                {counts.total} Reports
              </span>
            </div>

            {/* Severity Breakdown */}
            <div>
              <p className="text-[10px] uppercase font-bold text-text-tertiary mb-2">Severity Levels</p>
              <div className="grid grid-cols-2 gap-2">
                <div
                  onClick={() => setSeverityFilter(severityFilter === "CRITICAL" ? "ALL" : "CRITICAL")}
                  className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    severityFilter === "CRITICAL"
                      ? "bg-red-500/20 border-red-500 text-red-500 font-bold"
                      : "bg-surface-1 border-border text-text-primary hover:border-red-500/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span>Critical</span>
                  </div>
                  <span className="text-xs font-bold font-mono">{counts.critical}</span>
                </div>

                <div
                  onClick={() => setSeverityFilter(severityFilter === "HIGH" ? "ALL" : "HIGH")}
                  className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    severityFilter === "HIGH"
                      ? "bg-orange-500/20 border-orange-500 text-orange-500 font-bold"
                      : "bg-surface-1 border-border text-text-primary hover:border-orange-500/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    <span>High</span>
                  </div>
                  <span className="text-xs font-bold font-mono">{counts.high}</span>
                </div>

                <div
                  onClick={() => setSeverityFilter(severityFilter === "MEDIUM" ? "ALL" : "MEDIUM")}
                  className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    severityFilter === "MEDIUM"
                      ? "bg-amber-500/20 border-amber-500 text-amber-500 font-bold"
                      : "bg-surface-1 border-border text-text-primary hover:border-amber-500/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    <span>Medium</span>
                  </div>
                  <span className="text-xs font-bold font-mono">{counts.medium}</span>
                </div>

                <div
                  onClick={() => setSeverityFilter(severityFilter === "LOW" ? "ALL" : "LOW")}
                  className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    severityFilter === "LOW"
                      ? "bg-green-500/20 border-green-500 text-green-500 font-bold"
                      : "bg-surface-1 border-border text-text-primary hover:border-green-500/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span>Low</span>
                  </div>
                  <span className="text-xs font-bold font-mono">{counts.low}</span>
                </div>
              </div>
            </div>

            {/* Quick Status Filter */}
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] uppercase font-bold text-text-tertiary mb-2">Resolution Status</p>
              <div className="flex gap-2">
                {["ALL", "ACTIVE", "RESOLVED"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      statusFilter === status
                        ? "bg-accent text-white"
                        : "bg-surface-1 text-text-tertiary hover:text-text-primary"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Geographic Scope Note */}
            <div className="pt-2 border-t border-border text-[11px] text-text-tertiary flex items-center justify-between">
              <span>Bounding Box: Nagpur Metro (1.5x)</span>
              <span className="text-accent font-bold">10 Zones · 178 Hubs</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
