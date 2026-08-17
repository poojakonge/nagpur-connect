/* ════════════════════════════════════════════════════════
   Department Incident Desk — /department/[code]/incidents
   Paginated incident feed with filters & detail modal
   All data from TiDB via /api/department/[code]/incidents
   ════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect, use, useCallback } from "react";
import { DepartmentHeader } from "@/components/department/DepartmentHeader";
import { DepartmentSubNav } from "@/components/department/DepartmentSubNav";
import { IncidentFilters } from "@/components/department/IncidentFilters";
import { IncidentFeed } from "@/components/department/IncidentFeed";
import { IncidentDetail } from "@/components/department/IncidentDetail";
import { IncidentData } from "@/components/department/IncidentCard";
import { DEPARTMENT_REGISTRY } from "@/lib/department-registry";

interface APIIncident {
  id?: string;
  incidentId?: string;
  trackingId?: string;
  publicReference?: string;
  title: string | null;
  severity: string | null;
  priorityScore?: number | null;
  priority?: number;
  incidentStatus?: string;
  deptStatus?: string;
  status?: string;
  routingReason?: string | null;
  citizenSummary?: string | null;
  summary?: string | null;
  locationText?: string | null;
  location?: string | null;
  isEmergency?: boolean;
  privacyLevel?: "PUBLIC" | "RESTRICTED" | "PRIVATE";
  assignedTo?: string;
  media?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    storageUrl: string | null;
  }>;
  createdAt?: string;
  timestamp?: string;
}

function mapToIncidentData(inc: APIIncident): IncidentData {
  return {
    id: inc.incidentId || inc.id || "",
    trackingId: inc.publicReference || inc.trackingId || "",
    category: inc.title || "Untitled Report",
    summary: inc.citizenSummary || inc.summary || inc.routingReason || "No description available",
    location: inc.locationText || inc.location || "Nagpur, Maharashtra",
    timestamp: inc.createdAt || inc.timestamp || new Date().toISOString(),
    status: inc.deptStatus || inc.status || "ROUTED",
    priority: inc.priorityScore || inc.priority || 0,
    privacyLevel: inc.privacyLevel || "PUBLIC",
    assignedTo: inc.assignedTo,
    media: inc.media,
  };
}

export default function IncidentDeskPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const dept = DEPARTMENT_REGISTRY[code] || { name: code, icon: "📋" };

  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedIncident, setSelectedIncident] = useState<IncidentData | null>(null);
  const [criticalCount, setCriticalCount] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({
    all: 0,
    incoming: 0,
    in_progress: 0,
    resolved: 0,
  });

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      // Map filter to API status
      let statusParam = activeFilter;
      const res = await fetch(
        `/api/department/${code}/incidents?limit=50&status=${statusParam}`
      );
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          setIncidents((d.incidents || []).map(mapToIncidentData));
        }
      }

      // Fetch stats for filter counts
      const statsRes = await fetch(`/api/department/${code}/stats`);
      if (statsRes.ok) {
        const s = await statsRes.json();
        if (s.success) {
          setCriticalCount(s.kpi.critical || 0);
          setCounts({
            all: s.kpi.total || 0,
            incoming: s.kpi.pending || 0,
            in_progress: s.kpi.active || 0,
            resolved: s.kpi.resolved || 0,
          });
        }
      }
    } catch (err) {
      console.error("[IncidentDesk] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [code, activeFilter]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleAccept = async (id: string) => {
    // Optimistic UI update
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id ? { ...inc, status: "ASSIGNED" } : inc
      )
    );
    setSelectedIncident(null);

    // Save to TiDB
    try {
      const res = await fetch(`/api/department/${code}/incidents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: id,
          action: "ACCEPT",
        }),
      });
      if (res.ok) {
        await fetchIncidents();
      }
    } catch (err) {
      console.error("[IncidentDesk] Accept API error:", err);
    }
  };

  const handleResolve = async (id: string) => {
    // Optimistic UI update
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id ? { ...inc, status: "RESOLVED" } : inc
      )
    );
    setSelectedIncident(null);

    // Save to TiDB
    try {
      const res = await fetch(`/api/department/${code}/incidents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: id,
          action: "RESOLVE",
        }),
      });
      if (res.ok) {
        await fetchIncidents();
      }
    } catch (err) {
      console.error("[IncidentDesk] Resolve API error:", err);
    }
  };

  const handleAssignTask = async (id: string, assignment: any) => {
    // Optimistic UI update
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id
          ? { ...inc, status: "IN_PROGRESS", assignedTo: assignment.workerName || assignment.workerId }
          : inc
      )
    );

    // Save to TiDB
    try {
      const res = await fetch(`/api/department/${code}/incidents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: id,
          action: "ASSIGN",
          workerId: assignment.workerId,
          workerName: assignment.workerName || assignment.workerId,
          notes: assignment.notes || assignment.instructions,
        }),
      });
      if (res.ok) {
        await fetchIncidents();
      }
    } catch (err) {
      console.error("[IncidentDesk] Assign API error:", err);
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <DepartmentHeader
        departmentName={dept.name}
        departmentIcon={dept.icon}
        criticalCount={criticalCount}
      />

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs">
        <IncidentFilters
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          counts={counts}
        />
      </div>

      {/* Feed */}
      <IncidentFeed
        incidents={incidents}
        onIncidentClick={(id) => {
          const inc = incidents.find((i) => i.id === id);
          if (inc) setSelectedIncident(inc);
        }}
        loading={loading}
      />

      {/* Detail Modal */}
      <IncidentDetail
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onAccept={handleAccept}
        onResolve={handleResolve}
        onAssignTask={handleAssignTask}
      />
    </div>
  );
}
