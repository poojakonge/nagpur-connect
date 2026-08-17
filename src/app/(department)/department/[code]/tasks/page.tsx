/* ════════════════════════════════════════════════════════
   Department Tasks & Dispatch — /department/[code]/tasks
   4-column Kanban pipeline from TiDB
   ════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect, use } from "react";
import { Badge } from "@/components/ui";
import { DepartmentHeader } from "@/components/department/DepartmentHeader";
import { DepartmentSubNav } from "@/components/department/DepartmentSubNav";
import { DEPARTMENT_REGISTRY } from "@/lib/department-registry";

interface TaskItem {
  id: string;
  trackingId: string;
  title: string;
  status: string;
  priority: number;
  location: string;
  createdAt: string;
  severity: string;
}

const COLUMNS = [
  { key: "ROUTED", label: "📥 Incoming", color: "border-blue-400", bg: "bg-blue-50" },
  { key: "ASSIGNED", label: "👷 Assigned", color: "border-amber-400", bg: "bg-amber-50" },
  { key: "IN_PROGRESS", label: "⚡ In Progress", color: "border-violet-400", bg: "bg-violet-50" },
  { key: "RESOLVED", label: "✅ Resolved", color: "border-emerald-400", bg: "bg-emerald-50" },
];

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TasksPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const dept = DEPARTMENT_REGISTRY[code] || { name: code, icon: "📋" };

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/department/${code}/tasks`);
        if (res.ok) {
          const d = await res.json();
          if (d.success) {
            setTasks(d.tasks || []);
          }
        }

        const statsRes = await fetch(`/api/department/${code}/stats`);
        if (statsRes.ok) {
          const s = await statsRes.json();
          if (s.success) setCriticalCount(s.kpi.critical || 0);
        }
      } catch (err) {
        console.error("[Tasks] Load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [code]);

  const grouped = COLUMNS.map((col) => ({
    ...col,
    items: tasks.filter((t) => t.status === col.key),
  }));

  return (
    <div className="space-y-6 fade-in">
      <DepartmentHeader
        departmentName={dept.name}
        departmentIcon={dept.icon}
        criticalCount={criticalCount}
      />

      <DepartmentSubNav departmentCode={code} />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-black text-slate-900 tracking-tight">
            Tasks & Dispatch Pipeline
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {tasks.length} total tasks across all stages
          </p>
        </div>
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-400">
          <div className="animate-spin inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full mb-3" />
          <p className="text-sm font-medium">Loading task pipeline...</p>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {grouped.map((col) => (
            <div key={col.key} className="flex flex-col">
              <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-xl border-t-[3px] ${col.color} bg-white border border-slate-200`}>
                <span className="text-xs font-bold text-slate-700">
                  {col.label}
                </span>
                <Badge variant="default" className="text-[10px] font-bold">
                  {col.items.length}
                </Badge>
              </div>

              <div className="flex-1 space-y-2 p-2 bg-slate-50/50 border border-t-0 border-slate-200 rounded-b-xl min-h-[200px]">
                {col.items.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No tasks
                  </div>
                )}
                {col.items.map((task) => (
                  <div
                    key={task.id}
                    className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                        {task.trackingId}
                      </span>
                      {task.severity === "CRITICAL" && (
                        <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          CRITICAL
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 line-clamp-2">
                      {task.title}
                    </h4>
                    {task.location && (
                      <p className="text-[11px] text-slate-500 truncate">
                        📍 {task.location}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {timeAgo(task.createdAt)}
                      </span>
                      <span
                        className={`text-[10px] font-bold ${
                          task.priority >= 80
                            ? "text-rose-600"
                            : task.priority >= 50
                            ? "text-amber-600"
                            : "text-slate-500"
                        }`}
                      >
                        P{task.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
