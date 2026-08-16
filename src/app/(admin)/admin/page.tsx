/* ════════════════════════════════════════════════════════
   Admin Dashboard — City Command Centre
   Live KPIs + real incident feed from TiDB
   ════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect } from "react";
import { Card, Badge } from "@/components/ui";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  ArrowRightIcon,
  MapIcon,
} from "@/components/ui/icons";
import Link from "next/link";

/* ─── Types ─── */
interface KPIData {
  total: number;
  criticalActive: number;
  inProgress: number;
  resolvedThisWeek: number;
  todayCount: number;
}

interface DeptWorkload {
  code: string;
  name: string;
  active: number;
  pending: number;
  resolved: number;
}

interface IncidentItem {
  publicReference: string;
  title: string | null;
  severity: string | null;
  status: string;
  createdAt: string;
  departments: { code: string; name: string; status: string }[];
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
  const map: Record<string, string> = {
    DRAFT: "Draft",
    CONFIRMED: "Confirmed",
    ROUTED: "Routed",
    ASSIGNED: "Assigned",
    IN_PROGRESS: "In Progress",
    WORK_COMPLETED: "Work Complete",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
  };
  return map[s] || s;
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminDashboard() {
  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [depts, setDepts] = useState<DeptWorkload[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [statsRes, incidentsRes] = await Promise.all([
          fetch("/api/admin/stats"),
          fetch("/api/admin/incidents?limit=5"),
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success) {
            setKpi(statsData.kpi);
            setDepts(statsData.departments || []);
          }
        }

        if (incidentsRes.ok) {
          const incData = await incidentsRes.json();
          if (incData.success) {
            setIncidents(incData.incidents || []);
          }
        }
      } catch (err) {
        console.error("[AdminDash] Load error:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const kpis = kpi
    ? [
        {
          label: "Total Incidents",
          value: kpi.total.toLocaleString(),
          change: `+${kpi.todayCount} today`,
          icon: <FileTextIcon size={20} />,
          color: "text-accent",
          bgColor: "bg-accent-muted",
        },
        {
          label: "Critical Active",
          value: String(kpi.criticalActive),
          change: "requires attention",
          icon: <AlertTriangleIcon size={20} />,
          color: "text-critical",
          bgColor: "bg-critical-bg",
        },
        {
          label: "In Progress",
          value: String(kpi.inProgress),
          change: "assigned + working",
          icon: <ClockIcon size={20} />,
          color: "text-warning",
          bgColor: "bg-warning-bg",
        },
        {
          label: "Resolved This Week",
          value: String(kpi.resolvedThisWeek),
          change: "last 7 days",
          icon: <CheckCircleIcon size={20} />,
          color: "text-success",
          bgColor: "bg-success-bg",
        },
      ]
    : [];

  return (
    <div className="space-y-8 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">City Command Centre</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Real-time overview of civic incident management across Nagpur
          </p>
        </div>
        <Link
          href="/admin/map"
          className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-surface-2 text-text-primary rounded-pill text-sm font-medium border border-border hover:bg-surface-3 transition-all"
        >
          <MapIcon size={16} />
          Live Map
        </Link>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="text-center py-12 text-text-tertiary">
          <div className="animate-spin inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full mb-3" />
          <p className="text-sm">Loading dashboard data...</p>
        </div>
      )}

      {error && (
        <Card variant="elevated" padding="md">
          <p className="text-sm text-critical">{error}</p>
        </Card>
      )}

      {/* KPI Cards */}
      {!loading && kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <Card key={k.label} variant="elevated" padding="md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-text-tertiary font-medium uppercase tracking-wider">
                    {k.label}
                  </p>
                  <p className="text-3xl font-bold tracking-tight mt-1">{k.value}</p>
                  <p className="text-xs text-text-tertiary mt-1">{k.change}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${k.bgColor} flex items-center justify-center ${k.color}`}>
                  {k.icon}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && kpis.length === 0 && incidents.length === 0 && (
        <Card variant="elevated" padding="lg">
          <div className="text-center py-8">
            <FileTextIcon size={48} className="text-text-tertiary/30 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">No incidents yet</h2>
            <p className="text-sm text-text-tertiary">
              When citizens report issues through the Citizen Dashboard, they will appear here in real time.
            </p>
          </div>
        </Card>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Incidents Feed */}
          <div className="lg:col-span-2">
            <Card padding="none">
              <div className="flex items-center justify-between px-6 py-4 border-b border-divider">
                <h2 className="text-base font-semibold">Priority Incident Feed</h2>
                <Link
                  href="/admin/incidents"
                  className="text-xs text-accent hover:text-accent-hover font-medium transition-colors flex items-center gap-1"
                >
                  View all <ArrowRightIcon size={12} />
                </Link>
              </div>
              <div className="divide-y divide-divider">
                {incidents.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-text-tertiary">
                    No incidents found. Reports from citizens will appear here.
                  </div>
                ) : (
                  incidents.map((incident) => (
                    <Link
                      key={incident.publicReference}
                      href={`/admin/incidents/${incident.publicReference}`}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-surface-1 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={severityVariant(incident.severity)}>
                            {incident.severity || "—"}
                          </Badge>
                          <span className="text-xs text-text-tertiary font-mono">
                            {incident.publicReference}
                          </span>
                        </div>
                        <p className="text-sm font-medium truncate">
                          {incident.title || "Untitled report"}
                        </p>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {incident.departments.map((d) => d.name).join(" · ") || "No departments"}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-text-tertiary">
                          {timeAgo(incident.createdAt)}
                        </p>
                        <Badge variant="default" className="mt-1">
                          {statusLabel(incident.status)}
                        </Badge>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </Card>
          </div>

          {/* Department Workload */}
          <div>
            <Card padding="none">
              <div className="flex items-center justify-between px-6 py-4 border-b border-divider">
                <h2 className="text-base font-semibold">Department Workload</h2>
                <Link
                  href="/admin/departments"
                  className="text-xs text-accent hover:text-accent-hover font-medium transition-colors"
                >
                  Manage
                </Link>
              </div>
              <div className="divide-y divide-divider">
                {depts.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-text-tertiary">
                    No department data yet.
                  </div>
                ) : (
                  depts.map((dept) => {
                    const total = dept.active + dept.pending + dept.resolved;
                    const pct = total > 0 ? Math.round((dept.resolved / total) * 100) : 0;
                    return (
                      <div key={dept.code} className="px-6 py-3">
                        <p className="text-sm font-medium mb-2 truncate">{dept.name}</p>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-warning">{dept.active} active</span>
                          <span className="text-text-tertiary">{dept.pending} pending</span>
                          <span className="text-success">{dept.resolved} resolved</span>
                        </div>
                        <div className="h-1.5 bg-surface-2 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
