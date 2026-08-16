/* ════════════════════════════════════════════════════════
   Department Dashboard — /department/[code]
   Real KPI data + incident feed filtered to this department
   ════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect, use } from "react";
import { Card, Badge, Button } from "@/components/ui";
import {
  FileTextIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
} from "@/components/ui/icons";
import Link from "next/link";

/* ─── Types ─── */
interface DeptKPI {
  total: number;
  active: number;
  pending: number;
  resolved: number;
  critical: number;
  todayCount: number;
  resolutionRate: number;
}

interface DeptIncident {
  incidentId: string;
  publicReference: string;
  title: string | null;
  severity: string | null;
  priorityScore: number | null;
  incidentStatus: string;
  deptStatus: string;
  routingReason: string | null;
  citizenSummary: string | null;
  locationText: string | null;
  isEmergency: boolean;
  createdAt: string;
}

/* ─── Helpers ─── */
const severityVariant = (s: string | null) => {
  switch (s) {
    case "CRITICAL": return "critical" as const;
    case "HIGH": return "high" as const;
    case "MEDIUM": return "medium" as const;
    case "LOW": return "low" as const;
    default: return "default" as const;
  }
};

const statusLabel = (s: string) => {
  const m: Record<string, string> = {
    ROUTED: "Incoming", ASSIGNED: "Assigned", IN_PROGRESS: "In Progress",
    WORK_COMPLETED: "Complete", RESOLVED: "Resolved", CLOSED: "Closed",
  };
  return m[s] || s;
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* Department display info — inline for now */
const DEPT_META: Record<string, { icon: string; name: string }> = {
  police: { icon: "🛡️", name: "City Police Department" },
  traffic_police: { icon: "🚦", name: "Traffic Police" },
  fire_brigade: { icon: "🔥", name: "Fire Brigade" },
  health_dept: { icon: "🏥", name: "Health Department" },
  ambulance: { icon: "🚑", name: "Ambulance Services" },
  water_supply: { icon: "💧", name: "Water Supply Department" },
  drainage: { icon: "🌊", name: "Drainage Department" },
  road_maintenance: { icon: "🛣️", name: "Road Maintenance / PWD" },
  traffic_management: { icon: "🚗", name: "Traffic Management" },
  waste_management: { icon: "🗑️", name: "Waste Management" },
  environment: { icon: "🌿", name: "Environmental Department" },
  electricity: { icon: "⚡", name: "Electricity Department" },
  disaster_management: { icon: "🚨", name: "Disaster Management" },
  municipal_corp: { icon: "🏛️", name: "Municipal Corporation (NMC)" },
  public_works: { icon: "🏗️", name: "Public Works Department" },
};

export default function DepartmentCodeDashboard({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const meta = DEPT_META[code] || { icon: "📋", name: code };

  const [kpi, setKpi] = useState<DeptKPI | null>(null);
  const [incidents, setIncidents] = useState<DeptIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [statsRes, incRes] = await Promise.all([
          fetch(`/api/department/${code}/stats`),
          fetch(`/api/department/${code}/incidents?limit=15&status=${statusFilter === "ALL" ? "" : statusFilter}`),
        ]);

        if (statsRes.ok) {
          const d = await statsRes.json();
          if (d.success) setKpi(d.kpi);
        }

        if (incRes.ok) {
          const d = await incRes.json();
          if (d.success) setIncidents(d.incidents || []);
        }
      } catch (err) {
        console.error("[DeptDash] Load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [code, statusFilter]);

  const kpiCards = kpi ? [
    { label: "Total Incidents", value: kpi.total, icon: <FileTextIcon size={18} />, color: "text-accent", bg: "bg-accent-muted" },
    { label: "Active / Assigned", value: kpi.active, icon: <ClockIcon size={18} />, color: "text-warning", bg: "bg-warning-bg" },
    { label: "Pending (Incoming)", value: kpi.pending, icon: <AlertTriangleIcon size={18} />, color: "text-high", bg: "bg-high-bg" },
    { label: "Resolved", value: kpi.resolved, icon: <CheckCircleIcon size={18} />, color: "text-success", bg: "bg-success-bg" },
  ] : [];

  return (
    <div className="space-y-8 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/department" className="text-xs text-accent hover:underline">
            ← All Departments
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {meta.icon} {meta.name}
          </h1>
          <p className="text-sm text-text-tertiary mt-0.5">
            Real-time incident management dashboard
          </p>
        </div>
        {kpi && kpi.critical > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-critical-bg border border-critical-border rounded-full">
            <AlertTriangleIcon size={14} className="text-critical" />
            <span className="text-xs font-bold text-critical">{kpi.critical} Critical</span>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-text-tertiary">
          <div className="animate-spin inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full mb-3" />
          <p className="text-sm">Loading department data...</p>
        </div>
      )}

      {/* KPI Cards */}
      {!loading && kpiCards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpiCards.map((k) => (
            <Card key={k.label} variant="elevated" padding="md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">{k.label}</p>
                  <p className="text-2xl font-bold tracking-tight mt-1">{k.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-xl ${k.bg} flex items-center justify-center ${k.color}`}>
                  {k.icon}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Resolution rate bar */}
      {!loading && kpi && (
        <Card padding="md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Resolution Rate</span>
            <span className="text-sm font-bold text-accent">{kpi.resolutionRate}%</span>
          </div>
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${kpi.resolutionRate}%` }}
            />
          </div>
          <p className="text-[10px] text-text-tertiary mt-1.5">
            {kpi.todayCount} new incident{kpi.todayCount !== 1 ? "s" : ""} today
          </p>
        </Card>
      )}

      {/* Status filter tabs */}
      {!loading && (
        <div className="flex items-center gap-2 flex-wrap">
          {["ALL", "ROUTED", "IN_PROGRESS", "RESOLVED"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === s
                  ? "bg-accent text-white"
                  : "bg-surface-1 text-text-tertiary hover:bg-surface-2"
              }`}
            >
              {s === "ALL" ? "All" : statusLabel(s)}
            </button>
          ))}
        </div>
      )}

      {/* Incident Feed */}
      {!loading && (
        <Card padding="none">
          <div className="flex items-center justify-between px-5 py-3 border-b border-divider">
            <h2 className="text-sm font-semibold">Incident Feed</h2>
            <span className="text-xs text-text-tertiary">{incidents.length} showing</span>
          </div>
          <div className="divide-y divide-divider">
            {incidents.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-text-tertiary">
                No incidents found for this department.
              </div>
            ) : (
              incidents.map((inc) => (
                <Link
                  key={inc.publicReference}
                  href={`/admin/incidents/${inc.publicReference}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-1 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant={severityVariant(inc.severity)}>
                        {inc.severity || "—"}
                      </Badge>
                      {inc.isEmergency && (
                        <span className="text-[10px] font-bold text-critical">🚨 EMERGENCY</span>
                      )}
                      <span className="text-[10px] text-text-tertiary font-mono">
                        {inc.publicReference}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">
                      {inc.title || "Untitled report"}
                    </p>
                    {inc.locationText && (
                      <p className="text-xs text-text-tertiary mt-0.5 truncate">
                        📍 {inc.locationText}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-text-tertiary">{timeAgo(inc.createdAt)}</p>
                    <Badge variant="default" className="mt-1 text-[10px]">
                      {statusLabel(inc.deptStatus)}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
