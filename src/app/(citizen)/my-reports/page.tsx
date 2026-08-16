/* ════════════════════════════════════════════════════════
   My Reports — Citizen report history
   Shows all submitted incidents from TiDB
   ════════════════════════════════════════════════════════ */

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CitizenHeader } from "@/components/citizen/citizen-header";
import { getOrCreateGuestId, citizenHeaders } from "@/lib/guest-id";

interface Report {
  publicReference: string;
  title: string;
  status: string;
  severity: string;
  priorityScore: number;
  categorySlug: string;
  createdAt: string;
}

export default function MyReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrCreateGuestId().then(() => fetchReports());
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/incidents/mine", {
        headers: citizenHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load reports");
      const data = await res.json();
      setReports(
        (data.incidents || []).map((i: Record<string, unknown>) => ({
          publicReference: (i.publicReference || i.public_reference) as string,
          title: i.title as string,
          status: i.status as string,
          severity: i.severity as string,
          priorityScore: (i.priorityScore || i.priority_score || 0) as number,
          categorySlug: (i.categorySlug || i.category_slug || "") as string,
          createdAt: (i.createdAt || i.created_at) as string,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const severityStyle = (s: string) => {
    switch (s?.toUpperCase()) {
      case "CRITICAL": return "bg-critical-bg text-critical";
      case "HIGH": return "bg-high-bg text-high";
      case "MEDIUM": return "bg-medium-bg text-medium";
      default: return "bg-low-bg text-low";
    }
  };

  const statusStyle = (s: string) => {
    switch (s) {
      case "RESOLVED":
      case "CLOSED":
        return "bg-success-bg text-success";
      case "IN_PROGRESS":
        return "bg-medium-bg text-medium";
      default:
        return "bg-accent/10 text-accent";
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <CitizenHeader />
      <main className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold text-text-primary">My Reports</h1>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-accent font-medium hover:underline cursor-pointer"
          >
            ← Dashboard
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-error-bg border border-error-border rounded-2xl p-4 mb-4">
            <p className="text-sm text-error">{error}</p>
            <button
              onClick={fetchReports}
              className="text-xs text-accent font-medium mt-2 cursor-pointer hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && reports.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-surface-1 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              No reports yet
            </h3>
            <p className="text-sm text-text-tertiary mb-4">
              Start by reporting an issue from the dashboard
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-5 py-2.5 bg-accent text-white rounded-full text-sm font-bold cursor-pointer hover:bg-accent-hover transition-all"
            >
              Report an Issue
            </button>
          </div>
        )}

        {!loading && reports.length > 0 && (
          <div className="space-y-2.5">
            {reports.map((report) => (
              <button
                key={report.publicReference}
                onClick={() =>
                  router.push(`/dashboard/${report.publicReference}`)
                }
                className="w-full bg-surface-0 border border-border rounded-2xl p-4 text-left hover:border-accent/30 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-bold text-accent">
                    {report.publicReference}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusStyle(report.status)}`}
                  >
                    {report.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-sm text-text-primary mb-2 line-clamp-2">
                  {report.title}
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${severityStyle(report.severity)}`}
                  >
                    {report.severity}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {new Date(report.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
