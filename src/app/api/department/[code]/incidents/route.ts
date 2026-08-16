/* ════════════════════════════════════════════════════════
   GET /api/department/[code]/incidents
   Department-filtered incident list from TiDB
   Returns incidents routed to this specific department
   ════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface DeptIncidentRow {
  incident_id: string;
  department_code: string;
  department_name: string;
  dept_status: string;
  routing_reason: string | null;
  public_reference: string;
  title: string | null;
  severity: string | null;
  priority_score: number | null;
  incident_status: string;
  citizen_summary: string | null;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  is_emergency: number;
  created_at: string;
}

interface CountRow {
  cnt: number;
}

export async function GET(
  request: NextRequest,
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

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    // Build WHERE
    const conditions = ["id.department_code = ?"];
    const queryParams: (string | number)[] = [code];

    if (statusFilter && statusFilter !== "ALL") {
      conditions.push("id.status = ?");
      queryParams.push(statusFilter);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Count
    const countRows = await query<CountRow>(
      `SELECT COUNT(*) AS cnt
       FROM incident_departments id
       JOIN incidents i ON i.id = id.incident_id
       ${whereClause}`,
      queryParams
    );
    const total = Number(countRows[0]?.cnt || 0);

    // Fetch page
    const rows = await query<DeptIncidentRow>(
      `SELECT id.incident_id, id.department_code, id.department_name,
              id.status AS dept_status, id.routing_reason,
              i.public_reference, i.title, i.severity, i.priority_score,
              i.status AS incident_status, i.citizen_summary,
              i.location_text, i.latitude, i.longitude, i.is_emergency,
              i.created_at
       FROM incident_departments id
       JOIN incidents i ON i.id = id.incident_id
       ${whereClause}
       ORDER BY i.priority_score DESC, i.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      queryParams
    );

    return NextResponse.json({
      success: true,
      departmentCode: code,
      departmentName: rows[0]?.department_name || code,
      incidents: rows.map((r) => ({
        incidentId: r.incident_id,
        publicReference: r.public_reference,
        title: r.title,
        severity: r.severity,
        priorityScore: r.priority_score,
        incidentStatus: r.incident_status,
        deptStatus: r.dept_status,
        routingReason: r.routing_reason,
        citizenSummary: r.citizen_summary,
        locationText: r.location_text,
        latitude: r.latitude,
        longitude: r.longitude,
        isEmergency: !!r.is_emergency,
        createdAt: r.created_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[API] /department/[code]/incidents error:", err);
    return NextResponse.json(
      { error: { code: "FETCH_FAILED", message: "Failed to fetch department incidents." } },
      { status: 500 }
    );
  }
}
