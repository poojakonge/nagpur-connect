/* ════════════════════════════════════════════════════════
   OSM Incident & Facilities Map — React-Leaflet Component
   - Strict 1.5x Nagpur Geographic Bounding Box (No World Pan)
   - OpenStreetMap / CartoDB / Satellite tile layers
   - Custom animated incident triage markers (Critical/High/Med/Low)
   - 178 Municipal GeoJSON facilities & 10 NMC zone polygons
   - Optimized rendering with memoized layer components
   ════════════════════════════════════════════════════════ */

"use client";

import React, { useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polygon,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import Link from "next/link";

/* ─── Nagpur Coordinates & Bounding Box (1.5x City Area) ─── */
export const NAGPUR_CENTER: [number, number] = [21.1458, 79.0882];

// 1.5x buffer strictly containing Nagpur City & Metro Jurisdiction
export const NAGPUR_BOUNDS: [[number, number], [number, number]] = [
  [20.8500, 78.7500], // South-West
  [21.4500, 79.4500], // North-East
];

export interface IncidentMarkerData {
  id: string;
  publicReference: string;
  title: string | null;
  severity: string | null;
  status: string;
  category: string | null;
  latitude: number;
  longitude: number;
  isEmergency: boolean;
  createdAt: string;
  departments: string[];
}

export interface FacilityMarkerData {
  id: string;
  name: string;
  departmentType: string;
  departmentName: string;
  facilityType: string;
  latitude: number;
  longitude: number;
  address?: string;
  zone?: string;
  contactNumber?: string;
  emergencyNumber?: string;
}

export interface ZoneData {
  id: string;
  zoneName: string;
  zoneNumber: number;
  areaSqKm: number;
  polygon: [number, number][];
  keyLocalities: string[];
}

export interface OsmIncidentMapProps {
  tileUrl: string;
  attribution: string;
  incidents: IncidentMarkerData[];
  facilities: FacilityMarkerData[];
  zones: ZoneData[];
  showIncidents: boolean;
  showFacilities: boolean;
  showZones: boolean;
  severityFilter: string;
  statusFilter: string;
  departmentFilter: string;
  selectedCoordinates?: [number, number] | null;
  onResetToNagpur?: () => void;
}

/* ─── Severity Color Palette ─── */
const SEVERITY_COLORS: Record<string, { bg: string; border: string; glow: string; text: string }> = {
  CRITICAL: { bg: "#ef4444", border: "#b91c1c", glow: "rgba(239, 68, 68, 0.7)", text: "#ffffff" },
  HIGH:     { bg: "#f97316", border: "#c2410c", glow: "rgba(249, 115, 22, 0.6)", text: "#ffffff" },
  MEDIUM:   { bg: "#eab308", border: "#a16207", glow: "rgba(234, 179, 8, 0.5)", text: "#000000" },
  LOW:      { bg: "#22c55e", border: "#15803d", glow: "rgba(34, 197, 94, 0.4)", text: "#ffffff" },
};

/* ─── Department Icon Config ─── */
const DEPT_ICONS: Record<string, { icon: string; color: string }> = {
  police:            { icon: "🚓", color: "#3b82f6" },
  traffic_police:    { icon: "🚦", color: "#f97316" },
  fire_brigade:      { icon: "🚒", color: "#ef4444" },
  water_supply:      { icon: "💧", color: "#06b6d4" },
  drainage:          { icon: "🚰", color: "#0891b2" },
  road_maintenance:  { icon: "🚧", color: "#d97706" },
  electricity:       { icon: "⚡", color: "#8b5cf6" },
  waste_management:  { icon: "♻️", color: "#10b981" },
  environment:       { icon: "🌱", color: "#16a34a" },
  forest_dept:       { icon: "🌲", color: "#15803d" },
  women_child:       { icon: "🛡️", color: "#db2777" },
  disaster_mgmt:     { icon: "🚨", color: "#dc2626" },
  health_dept:       { icon: "🏥", color: "#2563eb" },
  ambulance:         { icon: "🚑", color: "#e11d48" },
  municipal_corp:    { icon: "🏛️", color: "#6366f1" },
};

/* ─── Zone Colors ─── */
const ZONE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6",
  "#06b6d4", "#14b8a6", "#f97316", "#6366f1", "#84cc16"
];

/* ─── Controller for FlyTo and Re-centering ─── */
function MapController({ coords }: { coords?: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (coords && coords[0] && coords[1]) {
      map.flyTo(coords, 15.5, { duration: 1.2, easeLinearity: 0.25 });
    }
  }, [coords, map]);

  return null;
}

export default function OsmIncidentMap({
  tileUrl,
  attribution,
  incidents,
  facilities,
  zones,
  showIncidents,
  showFacilities,
  showZones,
  severityFilter,
  statusFilter,
  departmentFilter,
  selectedCoordinates,
}: OsmIncidentMapProps) {

  // Fix default Leaflet marker assets on mount
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    if (!showIncidents) return [];
    return incidents.filter((inc) => {
      if (!inc.latitude || !inc.longitude || isNaN(inc.latitude) || isNaN(inc.longitude)) {
        return false;
      }
      if (severityFilter !== "ALL" && inc.severity?.toUpperCase() !== severityFilter) {
        return false;
      }
      if (statusFilter === "ACTIVE" && (inc.status === "RESOLVED" || inc.status === "CLOSED")) {
        return false;
      }
      if (statusFilter === "RESOLVED" && inc.status !== "RESOLVED" && inc.status !== "CLOSED") {
        return false;
      }
      if (departmentFilter !== "ALL") {
        const matches = inc.departments.some(
          (d) => d.toLowerCase().includes(departmentFilter.toLowerCase().replace(/_/g, " "))
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [incidents, showIncidents, severityFilter, statusFilter, departmentFilter]);

  // Filtered facilities
  const filteredFacilities = useMemo(() => {
    if (!showFacilities) return [];
    return facilities.filter((fac) => {
      if (!fac.latitude || !fac.longitude || isNaN(fac.latitude) || isNaN(fac.longitude)) {
        return false;
      }
      if (departmentFilter !== "ALL") {
        if (fac.departmentType !== departmentFilter) return false;
      }
      return true;
    });
  }, [facilities, showFacilities, departmentFilter]);

  // Create Custom Incident DivIcon
  const createIncidentIcon = (incident: IncidentMarkerData) => {
    const sev = incident.severity?.toUpperCase() || "MEDIUM";
    const colors = SEVERITY_COLORS[sev] || SEVERITY_COLORS.MEDIUM;
    const isCritical = sev === "CRITICAL" || incident.isEmergency;

    const html = `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
        ${isCritical ? `
          <div style="
            position: absolute;
            inset: -6px;
            border-radius: 9999px;
            background: ${colors.glow};
            animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
          "></div>
        ` : ""}
        <div style="
          width: 32px;
          height: 32px;
          border-radius: 9999px;
          background: ${colors.bg};
          border: 3px solid #ffffff;
          box-shadow: 0 4px 12px ${colors.glow}, 0 2px 4px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-size: 13px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s ease;
        ">
          ${incident.isEmergency ? "🚨" : sev === "CRITICAL" ? "🔴" : sev === "HIGH" ? "⚠️" : "📌"}
        </div>
      </div>
    `;

    return L.divIcon({
      className: "custom-incident-marker",
      html,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18],
    });
  };

  // Create Custom Facility DivIcon
  const createFacilityIcon = (facility: FacilityMarkerData) => {
    const conf = DEPT_ICONS[facility.departmentType] || { icon: "🏢", color: "#64748b" };

    const html = `
      <div style="
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: #ffffff;
        border: 2px solid ${conf.color};
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        cursor: pointer;
      ">
        ${conf.icon}
      </div>
    `;

    return L.divIcon({
      className: "custom-facility-marker",
      html,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14],
    });
  };

  return (
    <MapContainer
      center={NAGPUR_CENTER}
      zoom={12}
      minZoom={11}
      maxZoom={18}
      maxBounds={NAGPUR_BOUNDS}
      maxBoundsViscosity={1.0}
      scrollWheelZoom={true}
      className="w-full h-full z-0"
      style={{ background: "#0f172a" }}
    >
      <TileLayer url={tileUrl} attribution={attribution} maxZoom={18} />

      <MapController coords={selectedCoordinates} />

      {/* ─── Zone Polygons ─── */}
      {showZones &&
        zones.map((zone, idx) => {
          const latLngs = (zone.polygon || []).map(([lng, lat]) => [lat, lng] as [number, number]);
          if (latLngs.length === 0) return null;
          const color = ZONE_COLORS[idx % ZONE_COLORS.length];

          return (
            <Polygon
              key={zone.id || idx}
              positions={latLngs}
              pathOptions={{
                color: color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.12,
                dashArray: "4, 4",
              }}
            >
              <Tooltip sticky>
                <div className="text-xs p-1">
                  <p className="font-bold text-slate-900 dark:text-white">{zone.zoneName}</p>
                  <p className="text-[10px] text-slate-500">Zone #{zone.zoneNumber} · {zone.areaSqKm} sq km</p>
                </div>
              </Tooltip>

              <Popup>
                <div className="p-2 max-w-xs font-sans">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-3 h-3 rounded-full" style={{ background: color }} />
                    <h3 className="font-bold text-sm text-slate-900">{zone.zoneName}</h3>
                  </div>
                  <p className="text-xs text-slate-600 mb-2">
                    NMC Administrative Zone #{zone.zoneNumber} ({zone.areaSqKm} sq. km)
                  </p>
                  {zone.keyLocalities && zone.keyLocalities.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Key Localities:</p>
                      <div className="flex flex-wrap gap-1">
                        {zone.keyLocalities.slice(0, 6).map((loc) => (
                          <span key={loc} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">
                            {loc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Popup>
            </Polygon>
          );
        })}

      {/* ─── Facility Markers ─── */}
      {filteredFacilities.map((facility) => (
        <Marker
          key={facility.id}
          position={[facility.latitude, facility.longitude]}
          icon={createFacilityIcon(facility)}
        >
          <Popup>
            <div className="p-2 max-w-xs font-sans">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-xl">
                  {DEPT_ICONS[facility.departmentType]?.icon || "🏢"}
                </span>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 leading-tight">
                    {facility.name}
                  </h4>
                  <span className="inline-block mt-1 text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                    {facility.departmentName}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-600 space-y-1 my-2">
                {facility.address && (
                  <p className="flex items-start gap-1.5">
                    <span className="text-slate-400">📍</span>
                    <span>{facility.address}</span>
                  </p>
                )}
                {facility.zone && (
                  <p className="flex items-center gap-1.5">
                    <span className="text-slate-400">🏛️</span>
                    <span>{facility.zone}</span>
                  </p>
                )}
                {facility.contactNumber && (
                  <p className="flex items-center gap-1.5">
                    <span className="text-slate-400">📞</span>
                    <a href={`tel:${facility.contactNumber}`} className="text-blue-600 font-bold hover:underline">
                      {facility.contactNumber}
                    </a>
                  </p>
                )}
                {facility.emergencyNumber && (
                  <p className="flex items-center gap-1.5 text-red-600 font-bold">
                    <span>🚨 Helpline:</span>
                    <a href={`tel:${facility.emergencyNumber}`} className="hover:underline">
                      {facility.emergencyNumber}
                    </a>
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 mt-2 flex justify-end">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                >
                  Get Directions ↗
                </a>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* ─── Incident Markers ─── */}
      {filteredIncidents.map((incident) => (
        <Marker
          key={incident.id}
          position={[incident.latitude, incident.longitude]}
          icon={createIncidentIcon(incident)}
        >
          <Popup>
            <div className="p-2 max-w-sm font-sans">
              <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-200">
                <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  {incident.publicReference}
                </span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{
                    background:
                      SEVERITY_COLORS[incident.severity?.toUpperCase() || "MEDIUM"]?.bg || "#eab308",
                  }}
                >
                  {incident.severity || "MEDIUM"}
                </span>
              </div>

              <h4 className="font-bold text-sm text-slate-900 line-clamp-2 mb-2">
                {incident.title || "Reported Civic Incident"}
              </h4>

              <div className="space-y-1 text-xs text-slate-600 mb-3 bg-slate-50 p-2 rounded-lg">
                <p className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-semibold text-slate-800">
                    {incident.status.replace(/_/g, " ")}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500">Reported:</span>
                  <span className="text-slate-700">
                    {new Date(incident.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </p>
                {incident.departments.length > 0 && (
                  <p className="flex justify-between">
                    <span className="text-slate-500">Routed to:</span>
                    <span className="font-medium text-blue-700 text-right">
                      {incident.departments.join(", ")}
                    </span>
                  </p>
                )}
              </div>

              <Link
                href={`/admin/incidents?search=${encodeURIComponent(incident.publicReference)}`}
                className="w-full block text-center py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                Inspect in Incident Tracker →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
