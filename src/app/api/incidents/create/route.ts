/* ════════════════════════════════════════════════════════
   POST /api/incidents/create
   Persist confirmed incident to TiDB
   Stores: department_answers, selected_department, geo_routing,
           AI Q&A conversations, final AI report
   Uses real citizen identity
   ════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { generateULID as ulid } from "@/lib/ids";
import { formatDepartmentName } from "@/modules/ai/department-routing";
import { routeIncident } from "@/modules/geo/router";
import { getCitizenIdentity } from "@/lib/citizen-identity";
import {
  notifyReportReceived,
  notifyDepartment,
  notifyAdminEmergency,
} from "@/lib/notification-service";
import type { AnalysisResult } from "@/modules/ai/engine";
import type { GeoRoutingResult } from "@/modules/geo/types";

/** Generate a public reference like NAG-2026-000042 */
async function generateReference(): Promise<string> {
  const year = new Date().getUTCFullYear();
  await execute("INSERT INTO incident_sequence (year) VALUES (?)", [year]);
  const rows = await query<{ id: number }>("SELECT LAST_INSERT_ID() as id");
  const seq = rows[0]?.id ?? Math.floor(Math.random() * 999999);
  return `NAG-${year}-${String(seq).padStart(6, "0")}`;
}

/** AI Q&A item from the client */
interface AIConversationItem {
  questionId: string;
  questionText: string;
  questionType: string;
  questionOptions?: string[];
  answerValue: string | string[];
  required: boolean;
  sortOrder: number;
}

export async function POST(request: NextRequest) {
  try {
    // Extract real citizen identity
    const identity = await getCitizenIdentity(request);
    const citizenId = identity?.citizenId ?? "anonymous";

    const body = await request.json();
    const {
      originalText,
      originalTranscript,
      analysis,
      locationText,
      latitude,
      longitude,
      departmentAnswers,
      selectedDepartment,
      aiConversation,
      finalReport: clientFinalReport,
      privacyLevel: clientPrivacy,
      attachments,
    } = body as {
      originalText: string;
      originalTranscript?: string;
      analysis: AnalysisResult;
      locationText?: string;
      latitude?: number;
      longitude?: number;
      departmentAnswers?: Record<string, string | string[]>;
      selectedDepartment?: string;
      aiConversation?: AIConversationItem[];
      finalReport?: Record<string, unknown> | null;
      privacyLevel?: string;
      attachments?: Array<{
        fileName: string;
        mimeType: string;
        fileSize: number;
        storageUrl: string;
        purpose?: string;
      }>;
    };

    if (!analysis || !analysis.summary) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Analysis data is required",
          },
        },
        { status: 400 }
      );
    }

    const incidentId = ulid();
    const publicReference = await generateReference();

    // Map privacy level — prefer client choice, fall back to AI analysis
    const privacyLevel = clientPrivacy
      ? clientPrivacy.toUpperCase()
      : analysis.privacy.level === "sensitive"
        ? "SENSITIVE"
        : analysis.privacy.level === "restricted"
          ? "RESTRICTED"
          : "PUBLIC";

    // Map severity
    const severity = (analysis.severity.level || "medium").toUpperCase();

    // Build final AI report JSON — merge Stage 3 synthesis if available
    const finalAiReport = {
      incidentType: analysis.incidentType,
      category: analysis.mainCategoryName,
      subcategory: analysis.subcategory,
      summary: clientFinalReport?.finalSummary || analysis.summary,
      severity: analysis.severity,
      priority: analysis.priority,
      affectedPeople: clientFinalReport?.affectedPeople ?? analysis.affectedPeople,
      departments: analysis.departments,
      location: analysis.location,
      privacy: analysis.privacy,
      isEmergency: analysis.isEmergency,
      confidence: analysis.confidence,
      deptQuestions: analysis.deptQuestions,
      questionsForCitizen: analysis.questionsForCitizen,
      aiProvider: analysis.aiProvider,
      aiModel: analysis.aiModel,
      // Stage 3 synthesis
      keyFindings: clientFinalReport?.keyFindings || [],
      recommendedActions: clientFinalReport?.recommendedActions || [],
      urgencyReason: clientFinalReport?.urgencyReason || "",
      finalSummary: clientFinalReport?.finalSummary || null,
      generatedAt: new Date().toISOString(),
    };

    // Insert the incident with real citizen identity
    await execute(
      `INSERT INTO incidents (
        id, public_reference, citizen_id, selected_department, category_slug, subcategory_slug,
        status, severity, priority_score, priority_band, privacy_level,
        title, citizen_summary, internal_summary, original_text,
        location_text, latitude, longitude,
        is_emergency, ai_provider, ai_model, ai_confidence, ai_analysis,
        department_answers, confirmed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        incidentId,
        publicReference,
        citizenId,
        selectedDepartment || null,
        analysis.mainCategory || null,
        analysis.subcategory || null,
        "CONFIRMED",
        severity,
        analysis.priority.score,
        analysis.priority.band,
        privacyLevel,
        analysis.summary.slice(0, 200),
        analysis.summary,
        `${analysis.mainCategoryName} — ${analysis.incidentType}. Score: ${analysis.priority.score}`,
        originalText || null,
        locationText || analysis.location.text || null,
        latitude || null,
        longitude || null,
        analysis.isEmergency ? 1 : 0,
        analysis.aiProvider || null,
        analysis.aiModel || null,
        analysis.confidence.overall || null,
        JSON.stringify(analysis),
        departmentAnswers ? JSON.stringify(departmentAnswers) : null,
      ]
    );

    // Store final AI report (try ALTER TABLE if column doesn't exist yet)
    try {
      await execute(
        `UPDATE incidents SET final_ai_report = ? WHERE id = ?`,
        [JSON.stringify(finalAiReport), incidentId]
      );
    } catch {
      // Column may not exist yet — non-fatal
      console.warn("[API] final_ai_report column not available — skipping");
    }

    // Store original transcript if voice input
    if (originalTranscript) {
      try {
        await execute(
          `UPDATE incidents SET original_transcript = ? WHERE id = ?`,
          [originalTranscript, incidentId]
        );
      } catch {
        // Column may not exist yet — non-fatal
      }
    }

    // Insert AI conversation (questions + answers) if provided
    if (aiConversation && aiConversation.length > 0) {
      try {
        for (const item of aiConversation) {
          const answerStr = Array.isArray(item.answerValue)
            ? item.answerValue.join(", ")
            : String(item.answerValue || "");

          await execute(
            `INSERT INTO incident_ai_conversations (
              id, incident_id, question_id, question_text, question_type,
              question_options, answer_value, answer_timestamp,
              is_required, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
            [
              ulid(),
              incidentId,
              item.questionId,
              item.questionText,
              item.questionType,
              item.questionOptions ? JSON.stringify(item.questionOptions) : null,
              answerStr,
              item.required ? 1 : 0,
              item.sortOrder,
            ]
          );
        }
      } catch (qaErr) {
        // Q&A table may not exist yet — non-fatal
        console.warn("[API] AI conversations table not available:", qaErr);
      }
    }

    // Insert attachments into incident_media if provided
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      try {
        for (const att of attachments) {
          if (!att.storageUrl) continue;
          await execute(
            `INSERT INTO incident_media (
              id, incident_id, file_name, mime_type, file_size, storage_url, purpose, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              ulid(),
              incidentId,
              att.fileName || "attachment.jpg",
              att.mimeType || "image/jpeg",
              att.fileSize || 0,
              att.storageUrl,
              att.purpose || "evidence",
            ]
          );
        }
        console.log(`[API] Stored ${attachments.length} attachments for incident ${publicReference}`);
      } catch (mediaErr) {
        console.warn("[API] Failed to store attachments (non-fatal):", mediaErr);
      }
    }

    // Insert department routing
    for (const dept of analysis.departments) {
      await execute(
        `INSERT INTO incident_departments (
          id, incident_id, department_code, department_name,
          routing_reason, status
        ) VALUES (?, ?, ?, ?, ?, 'ROUTED')`,
        [
          ulid(),
          incidentId,
          dept.code,
          dept.name,
          dept.reason,
        ]
      );
    }

    // Record status history
    await execute(
      `INSERT INTO incident_status_history (
        id, incident_id, from_status, to_status, actor_id, reason
      ) VALUES (?, ?, 'DRAFT', 'CONFIRMED', ?, ?)`,
      [
        ulid(),
        incidentId,
        citizenId,
        departmentAnswers && Object.keys(departmentAnswers).length > 0
          ? "Citizen confirmed AI analysis with dept-specific answers"
          : "Citizen confirmed AI analysis",
      ]
    );

    // ─── Geo Routing ───
    let geoRouting: GeoRoutingResult | null = null;
    if (latitude && longitude && analysis.departments.length > 0) {
      try {
        geoRouting = routeIncident({
          latitude,
          longitude,
          requiredDepartments: analysis.departments.map((d) => d.code),
        });

        await execute(
          `UPDATE incidents SET geo_routing = ? WHERE id = ?`,
          [JSON.stringify(geoRouting), incidentId]
        );

        console.log(
          `[API] Geo routing: zone=${geoRouting.matchedZone?.zoneName || "none"} ` +
            `recommendations=${geoRouting.recommendations.length} in ${geoRouting.processingTimeMs}ms`
        );
      } catch (geoErr) {
        console.warn("[API] Geo routing failed (non-fatal):", geoErr);
      }
    }

    // ─── Fire notifications (non-blocking, non-fatal) ───
    Promise.allSettled([
      // Citizen: report received
      notifyReportReceived({
        citizenId,
        incidentId,
        publicReference,
        title: analysis.summary,
      }),
      // Each department: new incident routed
      ...analysis.departments.map((d) =>
        notifyDepartment({
          departmentCode: d.code,
          incidentId,
          publicReference,
          severity,
          title: analysis.summary,
        })
      ),
      // Admin: emergency alert
      ...(analysis.isEmergency
        ? [
            notifyAdminEmergency({
              incidentId,
              publicReference,
              title: analysis.summary,
            }),
          ]
        : []),
    ]).catch(() => {});

    console.log(
      `[API] Incident created: ${publicReference} | citizen=${citizenId} | ` +
        `${analysis.mainCategory}/${analysis.subcategory} | ${severity} | ` +
        `depts=[${analysis.departments.map((d) => d.code).join(",")}] | ` +
        `answers=${departmentAnswers ? Object.keys(departmentAnswers).length : 0} | ` +
        `qa=${aiConversation?.length || 0} | geo=${geoRouting ? "yes" : "no"}`
    );

    return NextResponse.json({
      success: true,
      incident: {
        id: incidentId,
        publicReference,
        title: analysis.summary,
        status: "CONFIRMED",
        severity,
        priorityScore: analysis.priority.score,
        priorityBand: analysis.priority.band,
        isEmergency: analysis.isEmergency,
        departments: analysis.departments.map((d) => ({
          code: d.code,
          name: d.name,
        })),
        createdAt: new Date().toISOString(),
      },
      geoRouting: geoRouting || undefined,
    });
  } catch (err) {
    console.error("[API] /incidents/create error:", err);
    return NextResponse.json(
      {
        error: {
          code: "CREATE_FAILED",
          message: "Failed to create the incident. Please try again.",
          retryable: true,
        },
      },
      { status: 500 }
    );
  }
}
