/* ════════════════════════════════════════════════════════
   GET /api/department/[code]/tasks
   Department task queue from TiDB for Kanban board
   Groups incidents by dept_status for pipeline display — Latest first
   ════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface TaskRow {
  incident_id: string;
  public_reference: string;
  category_slug: string | null;
  subcategory_slug: string | null;
  title: string | null;
  citizen_summary: string | null;
  dept_status: string;
  priority_score: number | null;
  severity: string | null;
  location_text: string | null;
  created_at: string;
}

function deriveTitle(r: TaskRow): string {
  if (r.title && r.title.trim() && !r.title.toLowerCase().includes("untitled")) {
    return r.title.trim();
  }
  if (r.citizen_summary && r.citizen_summary.trim()) {
    const s = r.citizen_summary.trim();
    return s.length > 70 ? s.slice(0, 67) + "..." : s;
  }
  if (r.subcategory_slug) {
    return r.subcategory_slug
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return "Civic Task";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    if (!code) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Department code is required" } },
        { status: 400 }
      );
    }

    const rows = await query<TaskRow>(
      `SELECT
        id.incident_id,
        i.public_reference,
        i.category_slug,
        i.subcategory_slug,
        i.title,
        i.citizen_summary,
        id.status AS dept_status,
        COALESCE(i.priority_score, 0) AS priority_score,
        i.severity,
        i.location_text,
        i.created_at
      FROM incident_departments id
      JOIN incidents i ON i.id = id.incident_id
      WHERE id.department_code = ?
      ORDER BY i.created_at DESC
      LIMIT 100`,
      [code]
    );

    const tasks = rows.map((r) => ({
      id: r.incident_id,
      trackingId: r.public_reference,
      title: deriveTitle(r),
      status: r.dept_status,
      priority: Number(r.priority_score),
      severity: r.severity || "UNKNOWN",
      location: r.location_text || "",
      createdAt: r.created_at,
    }));

    // Compute status breakdown counts
    const statusCounts: Record<string, number> = {};
    for (const task of tasks) {
      statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      departmentCode: code,
      tasks,
      statusCounts,
      totalTasks: tasks.length,
    });
  } catch (err) {
    console.error("[API] /department/[code]/tasks error:", err);
    return NextResponse.json(
      { error: { code: "FETCH_FAILED", message: "Failed to fetch department tasks." } },
      { status: 500 }
    );
  }
}
