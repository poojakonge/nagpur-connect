/* ════════════════════════════════════════════════════════
   Worker Profile Page
   ════════════════════════════════════════════════════════ */

import { Card, Badge, Button } from "@/components/ui";
import { UserIcon, BuildingIcon, CheckCircleIcon, LogOutIcon } from "@/components/ui/icons";

export default function WorkerProfilePage() {
  return (
    <div className="space-y-6 fade-in">
      <h1 className="text-xl font-bold tracking-tight">My Profile</h1>

      <Card padding="lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center text-text-tertiary">
            <UserIcon size={28} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Ramesh Kumar</h2>
            <p className="text-sm text-text-tertiary">Field Worker</p>
            <Badge variant="success" className="mt-1">
              <CheckCircleIcon size={12} /> Available
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-divider">
            <span className="text-sm text-text-tertiary">Department</span>
            <span className="text-sm font-medium flex items-center gap-1.5">
              <BuildingIcon size={14} className="text-text-tertiary" />
              Roads & Public Works
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-divider">
            <span className="text-sm text-text-tertiary">Worker ID</span>
            <span className="text-sm font-mono text-text-secondary">W-ROADS-024</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-divider">
            <span className="text-sm text-text-tertiary">Tasks Completed</span>
            <span className="text-sm font-medium">47</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-divider">
            <span className="text-sm text-text-tertiary">This Month</span>
            <span className="text-sm font-medium">12</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-text-tertiary">Member Since</span>
            <span className="text-sm text-text-secondary">Jan 2026</span>
          </div>
        </div>
      </Card>

      <Button variant="danger" fullWidth icon={<LogOutIcon size={16} />}>
        Sign Out
      </Button>
    </div>
  );
}
