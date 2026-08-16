/* ════════════════════════════════════════════════════════
   GET /api/admin/stats
   KPI aggregation from real TiDB data
   Returns: total, critical_active, in_progress,
            resolved_this_week, department workload
   ════════════════════════════════════════════════════════ */

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface KPIRow {
  total: number;
  critical_active: number;
  in_progress: number;
  resolved_this_week: number;
  today_count: number;
}

interface DeptWorkloadRow {
  department_code: string;
  department_name: string;
  active: number;
  pending: number;
  resolved: number;
}

export async function GET() {
  try {
    // KPI aggregation — single query
    const kpiRows = await query<KPIRow>(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN severity = 'CRITICAL' AND status NOT IN ('RESOLVED','CLOSED') THEN 1 ELSE 0 END) AS critical_active,
        SUM(CASE WHEN status IN ('IN_PROGRESS','ASSIGNED') THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status = 'RESOLVED' AND resolved_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS resolved_this_week,
        SUM(CASE WHEN created_at > DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS today_count
      FROM incidents`
    );

    const kpi = kpiRows[0] || {
      total: 0,
      critical_active: 0,
      in_progress: 0,
      resolved_this_week: 0,
      today_count: 0,
    };

    // Department workload — aggregated from incident_departments
    const deptRows = await query<DeptWorkloadRow>(
      `SELECT
        department_code,
        department_name,
        SUM(CASE WHEN status IN ('IN_PROGRESS','ASSIGNED') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'ROUTED' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved
      FROM incident_departments
      GROUP BY department_code, department_name
      ORDER BY active DESC, pending DESC
      LIMIT 10`
    );

    return NextResponse.json({
      success: true,
      kpi: {
        total: Number(kpi.total),
        criticalActive: Number(kpi.critical_active),
        inProgress: Number(kpi.in_progress),
        resolvedThisWeek: Number(kpi.resolved_this_week),
        todayCount: Number(kpi.today_count),
      },
      departments: deptRows.map((d) => ({
        code: d.department_code,
        name: d.department_name,
        active: Number(d.active),
        pending: Number(d.pending),
        resolved: Number(d.resolved),
      })),
    });
  } catch (err) {
    console.error("[API] /admin/stats error:", err);
    return NextResponse.json(
      { error: { code: "STATS_FAILED", message: "Failed to fetch stats." } },
      { status: 500 }
    );
  }
}
