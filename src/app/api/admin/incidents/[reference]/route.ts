/* ════════════════════════════════════════════════════════
   GET /api/admin/incidents/[reference]
   Admin-level incident detail — full data including
   AI analysis, original text, department answers, geo routing
   ════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface IncidentRow {
  id: string;
  public_reference: string;
  citizen_id: string;
  category_slug: string | null;
  subcategory_slug: string | null;
  status: string;
  severity: string | null;
  priority_score: number | null;
  priority_band: string | null;
  privacy_level: string;
  title: string | null;
  citizen_summary: string | null;
  internal_summary: string | null;
  original_text: string | null;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  is_emergency: number;
  ai_provider: string | null;
  ai_model: string | null;
  ai_confidence: number | null;
  ai_analysis: string | null;
  selected_department: string | null;
  department_answers: string | null;
  confirmed_at: string | null;
  routed_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DepartmentRow {
  department_code: string;
  department_name: string;
  routing_reason: string | null;
  status: string;
  priority_override: number | null;
  received_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface HistoryRow {
  from_status: string;
  to_status: string;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

interface MediaRow {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_url: string | null;
  purpose: string;
  created_at: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  try {
    const { reference } = await params;

    if (!reference) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Reference is required" } },
        { status: 400 }
      );
    }

    // Fetch incident — full admin view
    const incidents = await query<IncidentRow>(
      `SELECT id, public_reference, citizen_id, category_slug, subcategory_slug,
              status, severity, priority_score, priority_band, privacy_level,
              title, citizen_summary, internal_summary, original_text,
              location_text, latitude, longitude, location_accuracy,
              is_emergency, ai_provider, ai_model, ai_confidence, ai_analysis,
              selected_department, department_answers,
              confirmed_at, routed_at, resolved_at, created_at, updated_at
       FROM incidents WHERE public_reference = ?`,
      [reference]
    );

    if (incidents.length === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Incident not found" } },
        { status: 404 }
      );
    }

    const incident = incidents[0];

    // Fetch departments, timeline, media in parallel
    const [departments, history, media] = await Promise.all([
      query<DepartmentRow>(
        `SELECT department_code, department_name, routing_reason, status,
                priority_override, received_at, resolved_at, created_at
         FROM incident_departments WHERE incident_id = ?
         ORDER BY created_at ASC`,
        [incident.id]
      ),
      query<HistoryRow>(
        `SELECT from_status, to_status, actor_id, reason, created_at
         FROM incident_status_history
         WHERE incident_id = ?
         ORDER BY created_at ASC`,
        [incident.id]
      ),
      query<MediaRow>(
        `SELECT id, file_name, mime_type, file_size, storage_url, purpose, created_at
         FROM incident_media WHERE incident_id = ?
         ORDER BY created_at ASC`,
        [incident.id]
      ),
    ]);

    // Parse JSON fields safely
    let aiAnalysis = null;
    try {
      aiAnalysis = incident.ai_analysis ? JSON.parse(incident.ai_analysis) : null;
    } catch { /* ignore parse errors */ }

    let departmentAnswers = null;
    try {
      departmentAnswers = incident.department_answers ? JSON.parse(incident.department_answers) : null;
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      incident: {
        id: incident.id,
        publicReference: incident.public_reference,
        citizenId: incident.citizen_id,
        category: incident.category_slug,
        subcategory: incident.subcategory_slug,
        status: incident.status,
        severity: incident.severity,
        priorityScore: incident.priority_score,
        priorityBand: incident.priority_band,
        privacyLevel: incident.privacy_level,
        title: incident.title,
        citizenSummary: incident.citizen_summary,
        internalSummary: incident.internal_summary,
        originalText: incident.original_text,
        locationText: incident.location_text,
        latitude: incident.latitude,
        longitude: incident.longitude,
        locationAccuracy: incident.location_accuracy,
        isEmergency: !!incident.is_emergency,
        selectedDepartment: incident.selected_department,
        departmentAnswers,
        ai: {
          provider: incident.ai_provider,
          model: incident.ai_model,
          confidence: incident.ai_confidence,
          analysis: aiAnalysis,
        },
        confirmedAt: incident.confirmed_at,
        routedAt: incident.routed_at,
        resolvedAt: incident.resolved_at,
        createdAt: incident.created_at,
        updatedAt: incident.updated_at,
      },
      departments: departments.map((d) => ({
        code: d.department_code,
        name: d.department_name,
        routingReason: d.routing_reason,
        status: d.status,
        priorityOverride: d.priority_override,
        receivedAt: d.received_at,
        resolvedAt: d.resolved_at,
        createdAt: d.created_at,
      })),
      timeline: history.map((h) => ({
        fromStatus: h.from_status,
        toStatus: h.to_status,
        actorId: h.actor_id,
        reason: h.reason,
        timestamp: h.created_at,
      })),
      media: media.map((m) => ({
        id: m.id,
        fileName: m.file_name,
        mimeType: m.mime_type,
        fileSize: m.file_size,
        storageUrl: m.storage_url,
        purpose: m.purpose,
        createdAt: m.created_at,
      })),
    });
  } catch (err) {
    console.error("[API] /admin/incidents/[reference] error:", err);
    return NextResponse.json(
      { error: { code: "FETCH_FAILED", message: "Failed to fetch incident." } },
      { status: 500 }
    );
  }
}
