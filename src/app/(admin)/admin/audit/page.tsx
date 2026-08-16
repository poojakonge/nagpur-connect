/* ════════════════════════════════════════════════════════
   Admin Audit Log
   ════════════════════════════════════════════════════════ */

import { Card, Badge } from "@/components/ui";
import { ClockIcon, UserIcon, ShieldIcon } from "@/components/ui/icons";

const auditEntries = [
  { id: 1, event: "INCIDENT_ROUTED", actor: "System", target: "NC-2026-001247", time: "12 min ago", detail: "Routed to Water & Drainage, Traffic Management" },
  { id: 2, event: "DEPARTMENT_APPROVED", actor: "admin@nagpur.gov", target: "FIRE", time: "1 hour ago", detail: "Fire & Rescue department approved" },
  { id: 3, event: "ACTIVATION_CODE_CREATED", actor: "admin@nagpur.gov", target: "FIRE", time: "1 hour ago", detail: "24h activation code generated" },
  { id: 4, event: "WORKER_ASSIGNED", actor: "dispatcher@roads.gov", target: "Task-T001", time: "2 hours ago", detail: "Worker Ramesh assigned to pothole repair" },
  { id: 5, event: "TASK_COMPLETED", actor: "worker@roads.gov", target: "Task-T002", time: "3 hours ago", detail: "Evidence uploaded and submitted for verification" },
  { id: 6, event: "INCIDENT_RESOLVED", actor: "dispatcher@water.gov", target: "NC-2026-001230", time: "4 hours ago", detail: "All department tasks verified and closed" },
  { id: 7, event: "LOGIN_SUCCESS", actor: "citizen@example.com", target: "Session", time: "5 hours ago", detail: "Citizen login from 192.168.x.x" },
  { id: 8, event: "PRIORITY_POLICY_UPDATED", actor: "admin@nagpur.gov", target: "Priority-v3", time: "6 hours ago", detail: "Critical threshold adjusted from 85 to 81" },
];

const eventColor = (event: string) => {
  if (event.includes("RESOLVED") || event.includes("APPROVED") || event.includes("COMPLETED")) return "success" as const;
  if (event.includes("CREATED") || event.includes("ROUTED")) return "accent" as const;
  if (event.includes("LOGIN")) return "default" as const;
  if (event.includes("UPDATED")) return "warning" as const;
  return "default" as const;
};

export default function AdminAuditPage() {
  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Immutable record of all security and operational events
        </p>
      </div>

      <Card padding="none">
        <div className="divide-y divide-divider">
          {auditEntries.map((entry) => (
            <div key={entry.id} className="px-6 py-4 hover:bg-surface-1 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-text-tertiary flex-shrink-0 mt-0.5">
                    <ShieldIcon size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={eventColor(entry.event)}>
                        {entry.event.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-text-tertiary font-mono">
                        → {entry.target}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary mt-1">{entry.detail}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <UserIcon size={12} className="text-text-tertiary" />
                      <span className="text-xs text-text-tertiary">{entry.actor}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-text-tertiary flex-shrink-0">
                  <ClockIcon size={12} />
                  {entry.time}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
