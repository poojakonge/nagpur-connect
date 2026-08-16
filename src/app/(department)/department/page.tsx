/* ════════════════════════════════════════════════════════
   Department Hub — /department
   Department selector with live workload from TiDB
   ════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect } from "react";
import { Card, Badge } from "@/components/ui";
import {
  FileTextIcon,
  AlertTriangleIcon,
} from "@/components/ui/icons";
import Link from "next/link";

/* ─── Types ─── */
interface DeptWorkload {
  code: string;
  name: string;
  active: number;
  pending: number;
  resolved: number;
}

/* ─── Department display metadata ─── */
const DEPT_META: Record<string, { icon: string; name: string }> = {
  police: { icon: "🛡️", name: "City Police" },
  traffic_police: { icon: "🚦", name: "Traffic Police" },
  fire_brigade: { icon: "🔥", name: "Fire Brigade" },
  health_dept: { icon: "🏥", name: "Health Dept" },
  ambulance: { icon: "🚑", name: "Ambulance" },
  water_supply: { icon: "💧", name: "Water Supply" },
  drainage: { icon: "🌊", name: "Drainage" },
  road_maintenance: { icon: "🛣️", name: "Roads / PWD" },
  traffic_management: { icon: "🚗", name: "Traffic Mgmt" },
  waste_management: { icon: "🗑️", name: "Waste Mgmt" },
  environment: { icon: "🌿", name: "Environment" },
  electricity: { icon: "⚡", name: "Electricity" },
  disaster_management: { icon: "🚨", name: "Disaster Mgmt" },
  municipal_corp: { icon: "🏛️", name: "NMC" },
  public_works: { icon: "🏗️", name: "Public Works" },
};

/* All possible department codes — show even if no incidents yet */
const ALL_DEPT_CODES = Object.keys(DEPT_META);

export default function DepartmentHub() {
  const [deptWorkloads, setDeptWorkloads] = useState<DeptWorkload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/stats");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.departments) {
            setDeptWorkloads(data.departments);
          }
        }
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Merge real workload data with all possible departments
  const workloadMap = new Map(deptWorkloads.map((d) => [d.code, d]));
  const allDepts = ALL_DEPT_CODES.map((code) => {
    const meta = DEPT_META[code];
    const workload = workloadMap.get(code);
    return {
      code,
      icon: meta.icon,
      name: meta.name,
      active: workload?.active || 0,
      pending: workload?.pending || 0,
      resolved: workload?.resolved || 0,
      total: (workload?.active || 0) + (workload?.pending || 0) + (workload?.resolved || 0),
    };
  });

  // Sort: departments with incidents first, then alphabetically
  allDepts.sort((a, b) => {
    if (a.total !== b.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-8 fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Department Hub</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Select a department to view its incident dashboard
        </p>
      </div>

      {loading && (
        <div className="text-center py-12 text-text-tertiary">
          <div className="animate-spin inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full mb-3" />
          <p className="text-sm">Loading departments...</p>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allDepts.map((dept) => {
            const pct = dept.total > 0 ? Math.round((dept.resolved / dept.total) * 100) : 0;
            const hasIncidents = dept.total > 0;

            return (
              <Link key={dept.code} href={`/department/${dept.code}`}>
                <Card
                  variant="elevated"
                  padding="md"
                  className="hover:border-accent/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-1 flex items-center justify-center text-lg group-hover:scale-110 transition-transform">
                      {dept.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                        {dept.name}
                      </h3>
                      <p className="text-[10px] text-text-tertiary font-mono">{dept.code}</p>
                    </div>
                    {dept.pending > 0 && (
                      <Badge variant="high" className="text-[10px]">
                        {dept.pending} incoming
                      </Badge>
                    )}
                  </div>

                  {hasIncidents ? (
                    <>
                      <div className="flex items-center gap-4 text-xs mb-2">
                        <span className="text-warning font-medium">{dept.active} active</span>
                        <span className="text-text-tertiary">{dept.pending} pending</span>
                        <span className="text-success font-medium">{dept.resolved} resolved</span>
                      </div>
                      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-text-tertiary mt-1">{pct}% resolution rate</p>
                    </>
                  ) : (
                    <p className="text-xs text-text-tertiary">No incidents yet</p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
