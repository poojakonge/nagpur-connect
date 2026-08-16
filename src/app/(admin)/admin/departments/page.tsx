/* ════════════════════════════════════════════════════════
   Admin Departments Management
   ════════════════════════════════════════════════════════ */

import { Card, Badge } from "@/components/ui";
import {
  BuildingIcon,
  CheckCircleIcon,
  ClockIcon,
  PlusIcon,
} from "@/components/ui/icons";
import Link from "next/link";

const departments = [
  { code: "ROADS", name: "Roads & Public Works", status: "APPROVED", workers: 24, activeIncidents: 42, type: "Infrastructure" },
  { code: "WATER", name: "Water & Drainage", status: "APPROVED", workers: 18, activeIncidents: 18, type: "Utilities" },
  { code: "ELEC", name: "Electrical Services", status: "APPROVED", workers: 15, activeIncidents: 23, type: "Utilities" },
  { code: "WASTE", name: "Waste & Sanitation", status: "APPROVED", workers: 32, activeIncidents: 31, type: "Sanitation" },
  { code: "TRAFFIC", name: "Traffic Management", status: "APPROVED", workers: 12, activeIncidents: 15, type: "Transport" },
  { code: "ENV", name: "Environmental Services", status: "APPROVED", workers: 8, activeIncidents: 7, type: "Environment" },
  { code: "FIRE", name: "Fire & Rescue", status: "PENDING", workers: 0, activeIncidents: 0, type: "Emergency" },
  { code: "HEALTH", name: "Public Health", status: "PENDING", workers: 0, activeIncidents: 0, type: "Health" },
];

export default function AdminDepartmentsPage() {
  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Manage department registrations, approvals, and activation codes
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/departments/approvals"
            className="inline-flex items-center gap-2 px-4 py-2 bg-warning-bg text-warning rounded-pill text-sm font-medium border border-warning-border hover:bg-[rgba(245,158,11,0.15)] transition-all"
          >
            <ClockIcon size={16} />
            2 Pending
          </Link>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-text-primary text-canvas rounded-pill text-sm font-medium hover:bg-[#d8d8db] transition-all">
            <PlusIcon size={16} />
            Add Department
          </button>
        </div>
      </div>

      {/* Department Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map((dept) => (
          <Card key={dept.code} variant="interactive" padding="md">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center text-text-secondary">
                <BuildingIcon size={20} />
              </div>
              <Badge
                variant={dept.status === "APPROVED" ? "success" : "warning"}
              >
                {dept.status === "APPROVED" ? (
                  <><CheckCircleIcon size={12} /> Active</>
                ) : (
                  <><ClockIcon size={12} /> Pending</>
                )}
              </Badge>
            </div>
            <h3 className="text-base font-semibold mb-0.5">{dept.name}</h3>
            <p className="text-xs text-text-tertiary mb-3">
              Code: {dept.code} · {dept.type}
            </p>
            {dept.status === "APPROVED" && (
              <div className="flex items-center gap-4 text-xs text-text-tertiary">
                <span>{dept.workers} workers</span>
                <span>{dept.activeIncidents} active incidents</span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
