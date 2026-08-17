/* ════════════════════════════════════════════════════════
   Tracking Timeline — Vertical timeline for incident updates
   Chronological events with dots, lines, worker info
   ════════════════════════════════════════════════════════ */

"use client";

interface TimelineEvent {
  status: string;
  description: string | null;
  timestamp: string;
}

interface TrackingTimelineProps {
  events: TimelineEvent[];
}

function formatTimestamp(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("en-IN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

const STATUS_CONFIG: Record<string, { label: string; icon: string; emailNote?: string }> = {
  DRAFT: { label: "Report Created", icon: "📝" },
  AI_PROCESSING: { label: "AI Analysis & Triage", icon: "🤖" },
  CONFIRMED: { label: "Report Submitted", icon: "📬", emailNote: "Confirmation email sent to registered citizen" },
  ROUTED: { label: "Routed to Department", icon: "🏢", emailNote: "Department notified of assignment" },
  RECEIVED: { label: "Received & Verified", icon: "📋" },
  ASSIGNED: { label: "Assigned to Ward Officer", icon: "👷" },
  IN_PROGRESS: { label: "Work In Progress", icon: "⚙️", emailNote: "Status update email sent" },
  EN_ROUTE: { label: "Team En Route", icon: "🚗" },
  REACHED_SITE: { label: "Inspecting Site", icon: "📍" },
  WORK_STARTED: { label: "Remediation Started", icon: "🛠️" },
  WORK_COMPLETED: { label: "Work Completed", icon: "✅" },
  PENDING_VERIFICATION: { label: "Pending Quality Check", icon: "🔍" },
  VERIFIED: { label: "Field Verified", icon: "⭐" },
  RESOLVED: { label: "Issue Resolved", icon: "🎉", emailNote: "Resolution email & closure summary sent" },
  CLOSED: { label: "Report Closed", icon: "📁" },
};

export function TrackingTimeline({ events }: TrackingTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-text-tertiary text-sm">
        No timeline events yet
      </div>
    );
  }

  // Reverse so newest is first
  const reversed = [...events].reverse();

  return (
    <div className="space-y-0">
      {reversed.map((event, index) => {
        const isFirst = index === 0;
        const isLast = index === reversed.length - 1;
        const config = STATUS_CONFIG[event.status] || { label: event.status, icon: "📌" };

        return (
          <div key={index} className="flex gap-3">
            {/* Dot + line */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs shadow-sm
                  ${isFirst ? "bg-accent text-white ring-4 ring-accent/20" : "bg-surface-2 text-text-primary border border-border"}
                `}
              >
                {config.icon}
              </div>
              {!isLast && (
                <div className="w-0.5 flex-1 bg-border/80 my-1" />
              )}
            </div>

            {/* Content */}
            <div className={`pb-5 flex-1 ${isLast ? "pb-0" : ""}`}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h4 className={`text-sm font-bold ${isFirst ? "text-accent" : "text-text-primary"}`}>
                  {config.label}
                </h4>
                <span className="text-[11px] text-text-tertiary font-medium">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
              {event.description && (
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  {event.description}
                </p>
              )}
              {config.emailNote && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-accent/90 bg-accent/5 border border-accent/15 px-2.5 py-0.5 rounded-full font-medium">
                  <span>✉️</span>
                  <span>{config.emailNote}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
