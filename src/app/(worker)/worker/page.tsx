/* ════════════════════════════════════════════════════════
   Worker Dashboard — Mobile-First Task Queue
   Low-distraction, thumb-friendly task execution
   ════════════════════════════════════════════════════════ */

"use client";

import { useState } from "react";
import { Card, Badge, Button } from "@/components/ui";
import {
  LocationIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CameraIcon,
  MapIcon,
} from "@/components/ui/icons";
import Link from "next/link";

type TaskStatus =
  | "ASSIGNED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "REACHED_SITE"
  | "WORK_STARTED"
  | "WORK_COMPLETED";

interface WorkerTask {
  id: string;
  incidentRef: string;
  title: string;
  description: string;
  location: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: TaskStatus;
  safetyNotes: string;
  assignedAt: string;
}

const tasks: WorkerTask[] = [
  {
    id: "T-001",
    incidentRef: "NC-2026-001246",
    title: "Fill pothole on Wardha Road near Manish Nagar",
    description: "Large pothole approximately 2ft x 3ft causing vehicle damage. Located on the left lane near the bus stop.",
    location: "Wardha Road, near Manish Nagar bus stop",
    priority: "HIGH",
    status: "ACCEPTED",
    safetyNotes: "Wear high-visibility vest. Set up traffic cones before starting work.",
    assignedAt: "30 min ago",
  },
  {
    id: "T-002",
    incidentRef: "NC-2026-001243",
    title: "Clear fallen tree debris in Dharampeth",
    description: "Tree has fallen across the road blocking traffic. Needs cutting and removal.",
    location: "Main Road, Dharampeth",
    priority: "HIGH",
    status: "ASSIGNED",
    safetyNotes: "Check for power lines before cutting. Use proper safety equipment.",
    assignedAt: "1 hour ago",
  },
];

const statusLabel = (s: TaskStatus) => {
  switch (s) {
    case "ASSIGNED": return "New";
    case "ACCEPTED": return "Accepted";
    case "EN_ROUTE": return "En Route";
    case "REACHED_SITE": return "On Site";
    case "WORK_STARTED": return "Working";
    case "WORK_COMPLETED": return "Complete";
    default: return s;
  }
};

const nextAction = (s: TaskStatus): { label: string; next: TaskStatus } | null => {
  switch (s) {
    case "ASSIGNED": return { label: "Accept Task", next: "ACCEPTED" };
    case "ACCEPTED": return { label: "Start Navigation", next: "EN_ROUTE" };
    case "EN_ROUTE": return { label: "I've Arrived", next: "REACHED_SITE" };
    case "REACHED_SITE": return { label: "Start Work", next: "WORK_STARTED" };
    case "WORK_STARTED": return { label: "Mark Complete", next: "WORK_COMPLETED" };
    default: return null;
  }
};

const priorityVariant = (p: string) => {
  switch (p) { case "HIGH": return "high" as const; case "MEDIUM": return "medium" as const; case "LOW": return "low" as const; default: return "default" as const; }
};

export default function WorkerDashboard() {
  const [taskList, setTaskList] = useState(tasks);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const handleTransition = (taskId: string, nextStatus: TaskStatus) => {
    setTaskList((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t))
    );
  };

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">My Tasks</h1>
        <p className="text-sm text-text-tertiary">
          {taskList.length} task{taskList.length !== 1 ? "s" : ""} assigned to you
        </p>
      </div>

      {/* Task List */}
      <div className="space-y-4">
        {taskList.map((task) => {
          const action = nextAction(task.status);
          const isExpanded = expandedTask === task.id;

          return (
            <Card
              key={task.id}
              padding="none"
              className={`overflow-hidden transition-all ${
                task.priority === "HIGH" ? "border-high-border" : ""
              }`}
            >
              {/* Task Header — Always visible */}
              <button
                className="w-full px-5 py-4 text-left hover:bg-surface-1 transition-colors"
                onClick={() => setExpandedTask(isExpanded ? null : task.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={priorityVariant(task.priority)}>
                        {task.priority}
                      </Badge>
                      <Badge variant="default">{statusLabel(task.status)}</Badge>
                    </div>
                    <p className="text-base font-semibold leading-tight">{task.title}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <LocationIcon size={13} className="text-text-tertiary" />
                      <span className="text-xs text-text-tertiary">{task.location}</span>
                    </div>
                  </div>
                  <span className="text-xs text-text-tertiary flex-shrink-0">
                    {task.assignedAt}
                  </span>
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-divider pt-4 space-y-4 slide-up">
                  {/* Description */}
                  <div>
                    <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">
                      Task Details
                    </p>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {task.description}
                    </p>
                  </div>

                  {/* Safety Notes */}
                  <div className="bg-warning-bg border border-warning-border rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangleIcon size={16} className="text-warning flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-warning mb-0.5">
                          Safety Instructions
                        </p>
                        <p className="text-xs text-text-secondary">{task.safetyNotes}</p>
                      </div>
                    </div>
                  </div>

                  {/* Navigation */}
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-surface-2 text-text-primary rounded-lg text-sm font-medium border border-border hover:bg-surface-3 transition-all min-h-[48px]">
                    <MapIcon size={18} />
                    Navigate to Location
                  </button>

                  {/* Photo Evidence */}
                  {(task.status === "WORK_STARTED" || task.status === "REACHED_SITE") && (
                    <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-surface-2 text-text-primary rounded-lg text-sm font-medium border border-border hover:bg-surface-3 transition-all min-h-[48px]">
                      <CameraIcon size={18} />
                      Upload Before/After Photos
                    </button>
                  )}

                  {/* Primary Action */}
                  {action && (
                    <Button
                      fullWidth
                      size="lg"
                      variant={
                        task.status === "WORK_STARTED" ? "accent" : "primary"
                      }
                      onClick={() => handleTransition(task.id, action.next)}
                      icon={
                        task.status === "WORK_STARTED" ? (
                          <CheckCircleIcon size={18} />
                        ) : (
                          <ArrowRightIcon size={18} />
                        )
                      }
                    >
                      {action.label}
                    </Button>
                  )}

                  {task.status === "WORK_COMPLETED" && (
                    <div className="bg-success-bg border border-success-border rounded-lg p-4 text-center">
                      <CheckCircleIcon size={24} className="text-success mx-auto mb-2" />
                      <p className="text-sm font-medium text-success">
                        Work Completed
                      </p>
                      <p className="text-xs text-text-tertiary mt-1">
                        Submitted for department verification
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-text-tertiary text-center">
                    Ref: {task.incidentRef} · Task: {task.id}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {taskList.length === 0 && (
        <div className="text-center py-16">
          <CheckCircleIcon size={40} className="text-text-tertiary/30 mx-auto mb-3" />
          <p className="text-text-tertiary">No tasks assigned</p>
        </div>
      )}
    </div>
  );
}
