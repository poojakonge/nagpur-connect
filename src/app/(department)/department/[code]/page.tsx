/* ════════════════════════════════════════════════════════
   Department Operations Console — /department/[code]
   Real KPI data + Critical Alerts + Facilities
   ════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect, use } from "react";
import { DepartmentHeader } from "@/components/department/DepartmentHeader";
import { DepartmentSubNav } from "@/components/department/DepartmentSubNav";
import { DepartmentStats } from "@/components/department/DepartmentStats";
import { CriticalIncidentPanel } from "@/components/department/CriticalIncidentPanel";
import { DepartmentOpsModule } from "@/components/department/DepartmentOpsModule";
import { DEPARTMENT_REGISTRY } from "@/lib/department-registry";

interface DeptKPI {
  total: number;
  active: number;
  pending: number;
  resolved: number;
  critical: number;
  todayCount: number;
  resolutionRate: number;
}

interface CriticalIncident {
  id: string;
  trackingId: string;
  category: string;
  location: string;
  affectedCount?: number;
  status: string;
}

export default function DepartmentOperationsConsole({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const dept = DEPARTMENT_REGISTRY[code] || { name: code, icon: "📋" };

  const [kpi, setKpi] = useState<DeptKPI | null>(null);
  const [criticalIncidents, setCriticalIncidents] = useState<CriticalIncident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Fetch KPIs
        const statsRes = await fetch(`/api/department/${code}/stats`);
        if (statsRes.ok) {
          const d = await statsRes.json();
          if (d.success) setKpi(d.kpi);
        }

        // Fetch critical incidents (high priority, unresolved)
        const incRes = await fetch(
          `/api/department/${code}/incidents?limit=10&status=`
        );
        if (incRes.ok) {
          const d = await incRes.json();
          if (d.success && d.incidents) {
            const critical = d.incidents
              .filter(
                (inc: any) =>
                  (inc.severity === "CRITICAL" || inc.severity === "HIGH") &&
                  inc.deptStatus !== "RESOLVED" &&
                  inc.deptStatus !== "CLOSED"
              )
              .map((inc: any) => ({
                id: inc.incidentId || inc.id || inc.publicReference,
                trackingId: inc.publicReference || inc.trackingId,
                category: inc.title && inc.title.trim() && !inc.title.toLowerCase().includes("untitled")
                  ? inc.title.trim()
                  : inc.citizenSummary || inc.category || "Emergency Civic Report",
                location: inc.locationText || inc.location || "Nagpur",
                status: inc.deptStatus || inc.status || "ROUTED",
              }));
            setCriticalIncidents(critical);
          }
        }
      } catch (err) {
        console.error("[DeptOps] Load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [code]);

  return (
    <div className="space-y-6 fade-in">
      <DepartmentHeader
        departmentName={dept.name}
        departmentIcon={dept.icon}
        criticalCount={kpi?.critical || 0}
      />

      <DepartmentSubNav departmentCode={code} />

      {loading && (
        <div className="text-center py-16 text-slate-400">
          <div className="animate-spin inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full mb-3" />
          <p className="text-sm font-medium">Loading operational data...</p>
        </div>
      )}

      {!loading && kpi && (
        <>
          <DepartmentStats
            total={kpi.total}
            active={kpi.active}
            pending={kpi.pending}
            resolved={kpi.resolved}
            resolutionRate={kpi.resolutionRate}
          />

          <CriticalIncidentPanel
            incidents={criticalIncidents}
            onViewIncident={(id) => {
              window.location.href = `/department/${code}/incidents`;
            }}
          />

          <DepartmentOpsModule
            departmentCode={code}
            departmentName={dept.name}
          />
        </>
      )}

      {!loading && !kpi && (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-2">
          <span className="text-4xl block">📭</span>
          <h3 className="text-base font-bold text-slate-900">No Data Available</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No incidents have been routed to this department yet.
          </p>
        </div>
      )}
    </div>
  );
}
