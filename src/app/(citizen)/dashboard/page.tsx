/* ════════════════════════════════════════════════════════
   Citizen Dashboard — Main screen
   State machine:
     home → composing → preview → analyzing
       → mismatch (wrong dept)
       → analysis (AI result)
       → dept_questions (max 4 chips)
       → submitting → success
   Department-centric, AI-first, minimal questioning
   ════════════════════════════════════════════════════════ */

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { CitizenHeader } from "@/components/citizen/citizen-header";
import { CategoryGrid } from "@/components/citizen/category-grid";
import { DraftPreview } from "@/components/citizen/draft-preview";
import { ReportAnalysis } from "@/components/citizen/report-analysis";
import { ReportSuccess } from "@/components/citizen/report-success";
import { DeptMismatch } from "@/components/citizen/dept-mismatch";
import { DeptQuestions } from "@/components/citizen/dept-questions";
import NearestFacilities from "@/components/citizen/nearest-facilities";
import { useSpeech } from "@/modules/speech/use-speech";
import { useIncidentDraft } from "@/modules/incidents/use-incident-draft";
import { getOrCreateGuestId, citizenHeaders } from "@/lib/guest-id";
import type { AnalysisResult } from "@/modules/ai/engine";
import type { AIFinalReport } from "@/modules/ai/groq-provider";
import type { GeoRoutingResult } from "@/modules/geo/types";

type DashboardView =
  | "home"
  | "composing"
  | "preview"
  | "analyzing"
  | "mismatch"       // wrong dept detected
  | "analysis"       // AI result display
  | "dept_questions" // max 4 dept-specific chips
  | "finalizing"     // NEW — calling Stage 3 AI
  | "final_review"   // NEW — show final report before Proceed
  | "submitting"
  | "success";

interface ActiveReport {
  publicReference: string;
  title: string;
  status: string;
  severity: string;
  createdAt: string;
}

interface CreatedIncident {
  publicReference: string;
  title: string;
  severity: string;
  priorityScore: number;
  priorityBand: string;
  isEmergency: boolean;
  departments: Array<{ code: string; name: string }>;
  createdAt: string;
}

export default function CitizenDashboard() {
  const router = useRouter();
  const [view, setView] = useState<DashboardView>("home");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [createdIncident, setCreatedIncident] = useState<CreatedIncident | null>(null);
  const [geoRouting, setGeoRouting] = useState<GeoRoutingResult | null>(null);
  const [activeReports, setActiveReports] = useState<ActiveReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deptAnswers, setDeptAnswers] = useState<Record<string, string | string[]>>({});
  const [finalReport, setFinalReport] = useState<AIFinalReport | null>(null);

  const speech = useSpeech("en-IN");
  const draft = useIncidentDraft();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize guest identity + fetch active reports on mount
  useEffect(() => {
    getOrCreateGuestId().then(() => {
      fetchActiveReports();
    });
  }, []);

  const fetchActiveReports = async () => {
    try {
      const res = await fetch("/api/incidents/mine", {
        headers: citizenHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveReports(
          (data.incidents || []).map((i: Record<string, unknown>) => ({
            publicReference: (i.publicReference as string) || (i.public_reference as string),
            title: i.title as string,
            status: i.status as string,
            severity: i.severity as string,
            createdAt: (i.createdAt as string) || (i.created_at as string),
          }))
        );
      }
    } catch {
      // Non-critical
    }
  };

  // ── State transitions ─────────────────────────────────

  const startComposing = useCallback(
    (source: "text" | "voice" | "category", categorySlug?: string) => {
      draft.reset();
      speech.resetTranscript();
      setError(null);
      setDeptAnswers({});
      setAnalysisResult(null);
      setGeoRouting(null);
      draft.setSource(source);

      if (categorySlug) {
        draft.setCategory(categorySlug);
      }

      if (source === "voice") {
        speech.startRecording();
      }

      // Auto-capture location silently in the background
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            draft.setLocation(
              `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
              pos.coords.latitude,
              pos.coords.longitude
            );
          },
          () => { /* Location denied — no problem, geo routing will be skipped */ },
          { timeout: 8000, maximumAge: 60000 }
        );
      }

      setView("composing");
    },
    [draft, speech]
  );

  const stopRecordingAndPreview = useCallback(() => {
    speech.stopRecording();

    // Desktop streaming: transcript is available synchronously after stop.
    // Mobile batch: transcript arrives async (batch transcription takes 5-20s).
    // On mobile, don't navigate yet — the useEffect below handles auto-advance.
    if (speech.transcript) {
      draft.appendText(speech.transcript);
      speech.resetTranscript();
      setView("preview");
    }
    // If no transcript yet: state will go to "processing", UI stays on composing.
    // useEffect watches for transcript + idle to auto-advance.
  }, [speech, draft]);

  // Auto-advance to preview when mobile batch transcription completes.
  // When MobileRecorderProvider finishes: onResult fires (sets speech.transcript),
  // then onStateChange("idle") fires. We react to that combination here.
  useEffect(() => {
    if (
      view === "composing" &&
      draft.draft.source === "voice" &&
      speech.state === "idle" &&
      !speech.isRecording &&
      speech.transcript
    ) {
      draft.appendText(speech.transcript);
      speech.resetTranscript();
      setView("preview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.state, speech.transcript]);

  const goToPreview = useCallback(() => setView("preview"), []);
  const goBackToComposing = useCallback(() => setView("composing"), []);

  const goHome = useCallback(() => {
    setView("home");
    draft.reset();
    speech.resetTranscript();
    setError(null);
    setAnalysisResult(null);
    setCreatedIncident(null);
    setGeoRouting(null);
    setDeptAnswers({});
    setFinalReport(null);
  }, [draft, speech]);

  // ── AI Analysis ────────────────────────────────────────

  const runAnalysis = useCallback(
    async (overrideDept?: string) => {
      setError(null);
      setView("analyzing");

      // Use override dept (from mismatch correction) or draft's selected category
      const deptToSend = overrideDept ?? draft.draft.selectedCategory ?? undefined;

      try {
        const res = await fetch("/api/incidents/analyze", {
          method: "POST",
          headers: citizenHeaders(),
          body: JSON.stringify({
            text: draft.draft.text,
            locationContext: draft.draft.locationText || undefined,
            selectedDepartment: deptToSend,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error?.message || `Analysis failed (${res.status})`);
        }

        const data = await res.json();
        const result: AnalysisResult = data.analysis;
        setAnalysisResult(result);

        // Route to mismatch screen if AI detected wrong dept
        if (result.mismatch && deptToSend) {
          setView("mismatch");
        } else {
          setView("analysis");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to analyze. Please try again.");
        setView("preview");
      }
    },
    [draft.draft]
  );

  // ── Mismatch handlers ──────────────────────────────────

  /** User accepts the correct department suggestion */
  const handleGoToCorrectDept = useCallback(
    (correctSlug: string) => {
      draft.setCategory(correctSlug);
      runAnalysis(correctSlug);
    },
    [draft, runAnalysis]
  );

  /** User overrides — keeps the wrong dept and continues */
  const handleOverrideMismatch = useCallback(() => {
    setView("analysis");
  }, []);

  // ── Analysis → Questions or Submit ────────────────────

  /**
   * Called when user clicks the CTA on the analysis screen.
   * If dept questions exist → show them.
   * If no questions → go straight to submit.
   */
  const handleAnalysisContinue = useCallback(() => {
    if (!analysisResult) return;
    if (analysisResult.deptQuestions && analysisResult.deptQuestions.length > 0) {
      setView("dept_questions");
    } else {
      // No questions — go straight to final review with empty answers
      setView("finalizing");
      fetch("/api/incidents/finalize", {
        method: "POST",
        headers: citizenHeaders(),
        body: JSON.stringify({
          originalText: draft.draft.text,
          analysis: analysisResult,
          answers: {},
          locationText: draft.draft.locationText || null,
        }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.success && data.finalReport) {
            setFinalReport(data.finalReport);
          }
          setView("final_review");
        })
        .catch(() => setView("final_review"));
    }
  }, [analysisResult, draft.draft]);

  /**
   * Called when citizen submits answers from DeptQuestions.
   * Calls Stage 3 AI to finalize, then shows final review.
   */
  const handleAnswersSubmitted = useCallback(
    async (answers: Record<string, string | string[]>) => {
      if (!analysisResult) return;
      setDeptAnswers(answers);
      setError(null);
      setView("finalizing");

      try {
        const res = await fetch("/api/incidents/finalize", {
          method: "POST",
          headers: citizenHeaders(),
          body: JSON.stringify({
            originalText: draft.draft.text,
            analysis: analysisResult,
            answers,
            locationText: draft.draft.locationText || null,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.finalReport) {
            setFinalReport(data.finalReport);
          }
        }
        // Even if finalize fails, show the review screen with initial analysis
        setView("final_review");
      } catch {
        // Non-fatal — show review with initial analysis
        setView("final_review");
      }
    },
    [analysisResult, draft.draft]
  );

  /**
   * Called when citizen presses "Submit Report" on the final_review screen.
   * Actually persists the incident to TiDB.
   */
  const handleProceed = useCallback(
    async (answers: Record<string, string | string[]>) => {
      if (!analysisResult) return;
      const effectiveAnswers = Object.keys(answers).length > 0 ? answers : deptAnswers;
      setError(null);
      setView("submitting");

      try {
        const aiConversation = analysisResult.deptQuestions
          ?.map((q, idx) => ({
            questionId: q.id,
            questionText: q.question,
            questionType: q.type,
            questionOptions: q.options || null,
            answerValue: (() => {
              const raw = effectiveAnswers[q.id];
              return Array.isArray(raw) ? raw.join(", ") : raw || "";
            })(),
            required: q.required,
            sortOrder: idx,
          }))
          .filter((item) => item.answerValue) || [];

        const res = await fetch("/api/incidents/create", {
          method: "POST",
          headers: citizenHeaders(),
          body: JSON.stringify({
            originalText: draft.draft.text,
            analysis: analysisResult,
            locationText: draft.draft.locationText || analysisResult.location.text,
            latitude: draft.draft.latitude,
            longitude: draft.draft.longitude,
            departmentAnswers: effectiveAnswers,
            selectedDepartment: draft.draft.selectedCategory || null,
            aiConversation,
            finalReport: finalReport || null,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error?.message || `Failed to create incident (${res.status})`);
        }

        const data = await res.json();
        setCreatedIncident(data.incident);
        if (data.geoRouting) setGeoRouting(data.geoRouting);
        setView("success");
        fetchActiveReports();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit report. Please try again.");
        setView("final_review");
      }
    },
    [analysisResult, draft.draft, deptAnswers, finalReport]
  );


  // ── Photo handling ─────────────────────────────────────

  const handleAddPhoto = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        for (let i = 0; i < files.length; i++) {
          draft.addPhoto(files[i]);
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [draft]
  );

  // ── Location ───────────────────────────────────────────

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      draft.setLocation("Location not available");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        draft.setLocation(
          `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
          pos.coords.latitude,
          pos.coords.longitude
        );
      },
      () => draft.setLocation("Could not detect location"),
      { timeout: 10000 }
    );
  }, [draft]);

  // ── Severity badge color helper ────────────────────────
  const getSeverityStyle = (sev: string) => {
    switch (sev?.toUpperCase()) {
      case "CRITICAL": return "bg-critical-bg text-critical";
      case "HIGH": return "bg-high-bg text-high";
      case "MEDIUM": return "bg-medium-bg text-medium";
      default: return "bg-low-bg text-low";
    }
  };

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-canvas">
      <CitizenHeader />

      <main className="max-w-lg mx-auto px-4 pb-32 pt-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Error banner */}
        {error && (
          <div className="bg-error-bg border border-error-border rounded-2xl p-4 mb-4 fade-in">
            <div className="flex items-start gap-2">
              <span className="text-base">⚠️</span>
              <div className="flex-1">
                <p className="text-sm text-error font-medium">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="text-xs text-text-tertiary mt-1 hover:text-text-primary cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ HOME VIEW ═══ */}
        {view === "home" && (
          <div className="space-y-6 fade-in">
            {/* Active reports */}
            {activeReports.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-3">
                  Active Reports
                </h2>
                <div className="space-y-2">
                  {activeReports.slice(0, 3).map((report) => (
                    <button
                      key={report.publicReference}
                      onClick={() => router.push(`/dashboard/${report.publicReference}`)}
                      className="w-full bg-surface-0 border border-border rounded-2xl p-4 text-left hover:border-accent/30 transition-colors cursor-pointer shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono font-bold text-accent">
                          {report.publicReference}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getSeverityStyle(report.severity)}`}>
                            {report.severity}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              report.status === "RESOLVED"
                                ? "bg-success-bg text-success"
                                : report.status === "IN_PROGRESS"
                                  ? "bg-medium-bg text-medium"
                                  : "bg-accent/10 text-accent"
                            }`}
                          >
                            {report.status.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-text-primary line-clamp-1">{report.title}</p>
                    </button>
                  ))}
                  {activeReports.length > 3 && (
                    <button
                      onClick={() => router.push("/my-reports")}
                      className="text-xs text-accent font-medium hover:underline cursor-pointer"
                    >
                      View all {activeReports.length} reports →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Category grid */}
            <CategoryGrid onSelect={(slug) => startComposing("category", slug)} />

            {/* Bottom input bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-surface-0/95 backdrop-blur-xl border-t border-border px-4 py-3 z-50" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              <div className="max-w-lg mx-auto flex items-center gap-3">
                <button
                  onClick={() => startComposing("text")}
                  className="flex-1 bg-surface-1 border border-border rounded-full px-4 py-3 text-sm text-text-tertiary text-left hover:border-accent/30 transition-colors cursor-pointer"
                >
                  Describe your problem...
                </button>
                <button
                  onClick={() => startComposing("voice")}
                  className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center shadow-lg hover:bg-accent-hover transition-all active:scale-95 cursor-pointer"
                  aria-label="Start voice report"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ COMPOSING VIEW ═══ */}
        {view === "composing" && (
          <div className="space-y-4 fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">
                {speech.isRecording ? "Listening..." : "Describe the Issue"}
              </h2>
              <button
                onClick={goHome}
                className="text-sm text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {/* Selected dept badge */}
            {draft.draft.selectedCategory && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-bold border border-accent/20">
                  {draft.draft.selectedCategory.replace(/_/g, " ")}
                </span>
                <button
                  onClick={() => draft.setCategory("")}
                  className="text-xs text-text-tertiary hover:text-text-primary cursor-pointer"
                >
                  Change
                </button>
              </div>
            )}

            {/* Mic recording state */}
            {(speech.isRecording || speech.state === "processing") && (
              <div className="bg-accent/5 border border-accent/20 rounded-2xl p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-accent/10 mx-auto mb-3 flex items-center justify-center animate-pulse">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                  </svg>
                </div>
                <p className="text-sm text-accent font-medium mb-1">
                  {speech.state === "processing"
                    ? (speech.isMobile ? "Transcribing your speech\u2026" : "Processing...")
                    : "Speak now"}
                </p>
                {speech.interimTranscript && (
                  <p className="text-sm text-text-secondary italic mt-2">
                    &ldquo;{speech.interimTranscript}&rdquo;
                  </p>
                )}
                {speech.transcript && (
                  <p className="text-sm text-text-primary mt-2">{speech.transcript}</p>
                )}
                {/* Only show Stop button while actively recording — not while batch-transcribing */}
                {speech.isRecording && (
                  <button
                    onClick={stopRecordingAndPreview}
                    className="mt-4 px-6 py-2.5 bg-accent text-white rounded-full text-sm font-bold cursor-pointer hover:bg-accent-hover transition-all"
                  >
                    Stop Recording
                  </button>
                )}
                {speech.state === "processing" && (
                  <p className="mt-3 text-xs text-text-tertiary">
                    {speech.isMobile
                      ? "Please wait while your speech is being transcribed\u2026"
                      : "Connecting to speech service\u2026"}
                  </p>
                )}
              </div>
            )}

            {/* Permission denied */}
            {speech.permissionDenied && (
              <div className="bg-error-bg border border-error-border rounded-2xl p-4">
                <p className="text-sm text-error font-medium mb-1">Microphone access denied</p>
                <p className="text-xs text-text-tertiary">
                  Please allow microphone access in your browser settings, or type your report below.
                </p>
              </div>
            )}

            {/* Text input */}
            {!speech.isRecording && speech.state !== "processing" && (
              <>
                <textarea
                  ref={textareaRef}
                  value={draft.draft.text}
                  onChange={(e) => draft.updateText(e.target.value)}
                  placeholder="Describe what happened, where, and when..."
                  className="w-full bg-surface-1 border border-border rounded-2xl p-4 text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
                  rows={5}
                  autoFocus
                />

                {/* Quick actions */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    onClick={handleAddPhoto}
                    className="flex items-center gap-1.5 px-3 py-2 bg-surface-1 border border-border rounded-full text-xs font-medium text-text-secondary hover:border-accent/30 transition-colors cursor-pointer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    Photo{draft.draft.photos.length > 0 ? ` (${draft.draft.photos.length})` : ""}
                  </button>
                  <button
                    onClick={requestLocation}
                    className="flex items-center gap-1.5 px-3 py-2 bg-surface-1 border border-border rounded-full text-xs font-medium text-text-secondary hover:border-accent/30 transition-colors cursor-pointer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {draft.draft.locationText ? "📍 Located" : "Location"}
                  </button>
                  <button
                    onClick={() => {
                      draft.setSource("voice");
                      speech.startRecording();
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-surface-1 border border-border rounded-full text-xs font-medium text-text-secondary hover:border-accent/30 transition-colors cursor-pointer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    </svg>
                    Voice
                  </button>
                </div>

                {/* Photo previews */}
                {draft.draft.photos.length > 0 && (
                  <div className="flex gap-2">
                    {draft.draft.photos.map((photo, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-border">
                        <img
                          src={URL.createObjectURL(photo)}
                          alt={`Photo ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => draft.removePhoto(i)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer text-[8px]"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={goToPreview}
                  disabled={!draft.isReadyForAnalysis}
                  className="w-full py-3.5 bg-accent text-white rounded-full text-sm font-bold hover:bg-accent-hover transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  Review Report →
                </button>
              </>
            )}
          </div>
        )}

        {/* ═══ PREVIEW VIEW ═══ */}
        {view === "preview" && (
          <DraftPreview
            draft={draft.draft}
            onEditText={goBackToComposing}
            onRecordAgain={() => {
              speech.resetTranscript();
              draft.updateText("");
              speech.startRecording();
              setView("composing");
            }}
            onRemovePhoto={(i) => draft.removePhoto(i)}
            onAddPhoto={handleAddPhoto}
            onEditLocation={requestLocation}
            onAnalyze={() => runAnalysis()}
            onCancel={goHome}
            isAnalyzing={false}
          />
        )}

        {/* ═══ ANALYZING VIEW ═══ */}
        {view === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-16 fade-in">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
              <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="var(--color-accent)" strokeWidth="4" />
                <path className="opacity-75" fill="var(--color-accent)" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-1">Analyzing Your Report</h2>
            <p className="text-sm text-text-tertiary">AI is understanding your problem...</p>
            <p className="text-xs text-text-tertiary mt-1 opacity-60">Stage 1 + 2 — takes ~3–5 seconds</p>
          </div>
        )}

        {/* ═══ MISMATCH VIEW ═══ */}
        {view === "mismatch" && analysisResult && draft.draft.selectedCategory && (
          <DeptMismatch
            analysis={analysisResult}
            selectedDepartmentSlug={draft.draft.selectedCategory}
            onGoToCorrect={handleGoToCorrectDept}
            onOverride={handleOverrideMismatch}
            onBack={() => setView("preview")}
          />
        )}

        {/* ═══ ANALYSIS VIEW ═══ */}
        {view === "analysis" && analysisResult && (
          <ReportAnalysis
            analysis={analysisResult}
            onContinue={handleAnalysisContinue}
            onBack={() => setView("preview")}
          />
        )}

        {/* ═══ DEPT QUESTIONS VIEW ═══ */}
        {view === "dept_questions" && analysisResult && (
          <DeptQuestions
            analysis={analysisResult}
            onSubmit={handleAnswersSubmitted}
            onBack={() => setView("analysis")}
          />
        )}

        {/* ═══ FINALIZING VIEW ═══ */}
        {view === "finalizing" && (
          <div className="flex flex-col items-center justify-center py-16 fade-in">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
              <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="var(--color-accent)" strokeWidth="4" />
                <path className="opacity-75" fill="var(--color-accent)" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-1">Generating Final Report</h2>
            <p className="text-sm text-text-tertiary">AI is summarizing your answers...</p>
            <p className="text-xs text-text-tertiary mt-1 opacity-60">Stage 3 — takes ~2–3 seconds</p>
          </div>
        )}

        {/* ═══ FINAL REVIEW VIEW ═══ */}
        {view === "final_review" && analysisResult && (
          <div className="space-y-4 fade-in">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView("dept_questions")}
                className="w-9 h-9 rounded-full hover:bg-surface-2 flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h2 className="text-lg font-bold text-text-primary">Your Report Summary</h2>
            </div>

            {/* Final report card */}
            <div className="bg-surface-0 border border-border rounded-2xl p-4 shadow-sm space-y-3">
              {/* Severity + priority */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  (finalReport?.severity || analysisResult.severity.level) === "critical" ? "bg-critical-bg text-critical" :
                  (finalReport?.severity || analysisResult.severity.level) === "high" ? "bg-high-bg text-high" :
                  (finalReport?.severity || analysisResult.severity.level) === "medium" ? "bg-medium-bg text-medium" :
                  "bg-low-bg text-low"
                }`}>
                  {(finalReport?.severity || analysisResult.severity.level).toUpperCase()}
                </span>
                <span className="text-xs text-text-tertiary">
                  Priority: {finalReport?.priorityScore ?? analysisResult.priority.score}/100
                </span>
                {(finalReport?.affectedPeople ?? analysisResult.affectedPeople) && (
                  <span className="text-xs text-text-tertiary">
                    {finalReport?.affectedPeople ?? analysisResult.affectedPeople} affected
                  </span>
                )}
              </div>

              {/* Summary */}
              <p className="text-sm text-text-primary leading-relaxed">
                {finalReport?.finalSummary || analysisResult.summary}
              </p>

              {/* Key findings */}
              {finalReport && finalReport.keyFindings.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Key Findings</p>
                  <ul className="space-y-1.5">
                    {finalReport.keyFindings.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                        <span className="text-accent mt-0.5 flex-shrink-0">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended actions */}
              {finalReport && finalReport.recommendedActions.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">What Happens Next</p>
                  <ul className="space-y-1.5">
                    {finalReport.recommendedActions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                        <span className="text-success mt-0.5 flex-shrink-0">→</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Departments */}
              {analysisResult.departments.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Notifying</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysisResult.departments.map((d) => (
                      <span key={d.code} className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full font-medium">
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Emergency notice */}
            {analysisResult.isEmergency && (
              <div className="bg-critical-bg border border-critical-border rounded-xl p-3.5 flex items-center gap-3">
                <span className="text-xl">🚨</span>
                <div>
                  <p className="text-sm font-bold text-critical">Emergency Flagged</p>
                  <p className="text-xs text-text-secondary">Priority response will be triggered.</p>
                </div>
              </div>
            )}

            {/* Blue PROCEED button */}
            <button
              onClick={() => handleProceed(deptAnswers)}
              className="w-full py-4 bg-accent text-white rounded-full text-base font-bold hover:bg-accent-hover transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg active:scale-95"
            >
              Submit Report
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
            <p className="text-center text-xs text-text-tertiary">
              Your report will be saved and departments will be notified
            </p>
          </div>
        )}

        {/* ═══ SUBMITTING VIEW ═══ */}
        {view === "submitting" && (
          <div className="flex flex-col items-center justify-center py-16 fade-in">
            <div className="w-16 h-16 rounded-full bg-success-bg flex items-center justify-center mb-4">
              <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="var(--color-success)" strokeWidth="4" />
                <path className="opacity-75" fill="var(--color-success)" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-1">Creating Your Report</h2>
            <p className="text-sm text-text-tertiary">Saving to database...</p>
          </div>
        )}


        {/* ═══ SUCCESS VIEW ═══ */}
        {view === "success" && createdIncident && (
          <ReportSuccess
            incident={createdIncident}
            geoRouting={geoRouting}
            onViewReport={() => router.push(`/dashboard/${createdIncident.publicReference}`)}
            onReportAnother={() => {
              goHome();
              startComposing("text");
            }}
            onGoHome={goHome}
          />
        )}
      </main>

      {/* Global CSS animations */}
      <style jsx global>{`
        .fade-in {
          animation: fadeIn 0.25s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
