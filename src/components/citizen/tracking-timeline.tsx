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

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Report Created",
  AI_PROCESSING: "AI Analyzing",
  CONFIRMED: "Report Submitted",
  ROUTED: "Routed to Departments",
  RECEIVED: "Received & Verified",
  ASSIGNED: "Assigned to Ward Officer",
  IN_PROGRESS: "Work In Progress",
  EN_ROUTE: "Worker En Route",
  REACHED_SITE: "Worker Reached Site",
  WORK_STARTED: "Work Started",
  WORK_COMPLETED: "Work Completed",
  PENDING_VERIFICATION: "Pending Verification",
  VERIFIED: "Verified",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
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

        return (
          <div key={index} className="flex gap-3">
            {/* Dot + line */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-3 h-3 rounded-full flex-shrink-0 mt-1.5
                  ${isFirst ? "bg-accent ring-4 ring-accent/20" : "bg-success"}
                `}
              />
              {!isLast && (
                <div className="w-0.5 flex-1 bg-border my-1" />
              )}
            </div>

            {/* Content */}
            <div className={`pb-5 ${isLast ? "pb-0" : ""}`}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h4 className={`text-sm font-semibold ${isFirst ? "text-accent" : "text-text-primary"}`}>
                  {STATUS_LABELS[event.status] || event.status}
                </h4>
                <span className="text-xs text-text-tertiary">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
              {event.description && (
                <p className="text-sm text-text-secondary mt-1 leading-relaxed">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
