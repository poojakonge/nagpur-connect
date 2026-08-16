/* ════════════════════════════════════════════════════════
   Incident Tracking Page — /dashboard/[reference]
   Map · Status card · AI Report · Q&A · Timeline · Departments
   ════════════════════════════════════════════════════════ */

"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { TrackingTimeline } from "@/components/citizen/tracking-timeline";
import { SeverityRing } from "@/components/citizen/severity-ring";
import { citizenHeaders } from "@/lib/guest-id";

interface IncidentDetail {
  publicReference: string;
  category: string | null;
  status: string;
  severity: string | null;
  priorityScore: number | null;
  title: string | null;
  citizenSummary: string | null;
  locationText: string | null;
  isEmergency: boolean;
  privacyLevel: string;
  createdAt: string;
  confirmedAt: string | null;
  resolvedAt: string | null;
  finalReport: {
    summary?: string;
    severity?: { level: string; score: number; reason: string };
    priority?: { score: number; band: string };
    affectedPeople?: number | null;
    departments?: Array<{ code: string; name: string; reason: string }>;
    isEmergency?: boolean;
  } | null;
}

interface Department {
  code: string;
  name: string;
  status: string;
}

interface TimelineEvent {
  status: string;
  description: string | null;
  timestamp: string;
}

interface AIConversationItem {
  questionId: string;
  questionText: string;
  questionType: string;
  answerValue: string | null;
  isRequired: boolean;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: "Submitted", className: "bg-accent/10 text-accent border-accent/20" },
  ROUTED: { label: "Routed", className: "bg-accent/10 text-accent border-accent/20" },
  IN_PROGRESS: { label: "In Progress", className: "bg-warning-bg text-warning border-warning-border" },
  PENDING_VERIFICATION: { label: "Verifying", className: "bg-warning-bg text-warning border-warning-border" },
  RESOLVED: { label: "Resolved", className: "bg-success-bg text-success border-success-border" },
  CLOSED: { label: "Closed", className: "bg-success-bg text-success border-success-border" },
};

export default function TrackingPage() {
  const params = useParams();
  const router = useRouter();
  const reference = params.reference as string;

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [aiConversation, setAiConversation] = useState<AIConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/incidents/${reference}`, {
          headers: citizenHeaders(),
        });
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error("You are not authorized to view this report.");
          }
          throw new Error(res.status === 404 ? "Report not found" : "Failed to load");
        }
        const data = await res.json();
        setIncident(data.incident);
        setDepartments(data.departments || []);
        setTimeline(data.timeline || []);
        setAiConversation(data.aiConversation || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [reference]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-sm text-text-tertiary">Loading report...</span>
        </div>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-error-bg flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-error">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-1">{error || "Not Found"}</h2>
          <p className="text-sm text-text-tertiary mb-4">
            {error?.includes("authorized")
              ? "You can only view reports that belong to you."
              : "We couldn\u0027t find a report with this reference."}
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2.5 bg-accent text-white rounded-full text-sm font-semibold hover:bg-accent-hover transition-colors cursor-pointer"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const badge = STATUS_BADGE[incident.status] || STATUS_BADGE.CONFIRMED;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="sticky top-0 z-[var(--z-sticky)] glass">
        <div className="flex items-center gap-3 px-4 h-14 max-w-3xl mx-auto">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-2 transition-colors cursor-pointer"
            aria-label="Go back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-accent">Report Details</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-8">
        {/* Report card */}
        <div className="bg-surface-0 border border-border rounded-2xl overflow-hidden mt-4 shadow-sm">
          {/* Map placeholder */}
          <div className="h-40 bg-surface-2 flex items-center justify-center relative">
            {incident.locationText && (
              <div className="absolute top-3 left-3 glass px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className="text-xs font-medium text-text-primary">{incident.locationText}</span>
              </div>
            )}
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-text-tertiary/30">
              <rect x="1" y="3" width="15" height="13" rx="1" />
              <path d="M16 8h4a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-3" />
            </svg>
          </div>

          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <h2 className="text-lg font-bold text-text-primary flex-1">{incident.title || "Untitled Report"}</h2>
              <span className={`ml-3 px-2.5 py-0.5 text-xs font-semibold rounded-full border whitespace-nowrap ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-sm text-text-tertiary">Report ID: #{incident.publicReference}</p>

            {incident.citizenSummary && (
              <p className="text-sm text-text-secondary mt-3 leading-relaxed">
                {incident.citizenSummary}
              </p>
            )}

            {/* Privacy badge */}
            {incident.privacyLevel && incident.privacyLevel !== "PUBLIC" && (
              <div className="mt-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  incident.privacyLevel === "SENSITIVE"
                    ? "bg-critical-bg text-critical"
                    : "bg-warning-bg text-warning"
                }`}>
                  🔒 {incident.privacyLevel}
                </span>
              </div>
            )}

            {/* Severity + departments row */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
              {incident.priorityScore != null && (
                <SeverityRing score={incident.priorityScore} size={48} strokeWidth={4} />
              )}
              {departments.length > 0 && (
                <div className="flex-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Departments</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {departments.map((d) => (
                      <span key={d.code} className="text-xs px-2 py-0.5 bg-accent/8 text-accent rounded-full">
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Final AI Report */}
        {incident.finalReport && (
          <section className="mt-6">
            <h2 className="text-lg font-bold text-text-primary mb-3">AI Analysis Report</h2>
            <div className="bg-surface-0 border border-border rounded-2xl p-4 space-y-3">
              {incident.finalReport.summary && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">Summary</span>
                  <p className="text-sm text-text-primary mt-0.5">{incident.finalReport.summary}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {incident.finalReport.severity && (
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">Severity</span>
                    <p className="text-sm font-bold text-text-primary mt-0.5 capitalize">{incident.finalReport.severity.level}</p>
                    <p className="text-xs text-text-tertiary">{incident.finalReport.severity.reason}</p>
                  </div>
                )}
                {incident.finalReport.affectedPeople != null && (
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">People Affected</span>
                    <p className="text-sm font-bold text-text-primary mt-0.5">{incident.finalReport.affectedPeople}</p>
                  </div>
                )}
              </div>
              {incident.finalReport.isEmergency && (
                <div className="bg-critical-bg border border-critical-border rounded-xl p-2.5 flex items-center gap-2">
                  <span className="text-base">🚨</span>
                  <span className="text-xs font-bold text-critical">Emergency Incident</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* AI Questions & Answers */}
        {aiConversation.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-bold text-text-primary mb-3">Questions & Answers</h2>
            <div className="bg-surface-0 border border-border rounded-2xl divide-y divide-border overflow-hidden">
              {aiConversation.map((item, idx) => (
                <div key={item.questionId || idx} className="p-4">
                  <p className="text-xs font-semibold text-text-tertiary mb-1">
                    Q{idx + 1}. {item.questionText}
                    {item.isRequired && <span className="text-critical ml-1">*</span>}
                  </p>
                  <p className="text-sm text-text-primary font-medium">
                    {item.answerValue || "—"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Timeline */}
        <section className="mt-6">
          <h2 className="text-lg font-bold text-text-primary mb-4">Tracking Timeline</h2>
          <div className="bg-surface-0 border border-border rounded-2xl p-4">
            <TrackingTimeline events={timeline} />
          </div>
        </section>
      </main>
    </div>
  );
}
