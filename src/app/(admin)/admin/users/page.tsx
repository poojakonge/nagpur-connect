/* ════════════════════════════════════════════════════════
   Admin Users Page
   ════════════════════════════════════════════════════════ */

import { Card, Badge } from "@/components/ui";
import { UserIcon, SearchIcon } from "@/components/ui/icons";

const users = [
  { id: "U001", name: "Admin User", email: "admin@nagpur.gov", role: "SUPER_ADMIN", status: "ACTIVE", lastLogin: "2 hours ago" },
  { id: "U002", name: "Priya Sharma", email: "priya@example.com", role: "CITIZEN", status: "ACTIVE", lastLogin: "1 day ago" },
  { id: "U003", name: "Roads Dispatcher", email: "dispatch@roads.gov", role: "DEPT_ADMIN", status: "ACTIVE", lastLogin: "30 min ago" },
  { id: "U004", name: "Ramesh Kumar", email: "ramesh@roads.gov", role: "WORKER", status: "ACTIVE", lastLogin: "15 min ago" },
  { id: "U005", name: "Water Admin", email: "admin@water.gov", role: "DEPT_ADMIN", status: "ACTIVE", lastLogin: "4 hours ago" },
  { id: "U006", name: "Citizen User", email: "user@example.com", role: "CITIZEN", status: "SUSPENDED", lastLogin: "30 days ago" },
];

const roleVariant = (r: string) => {
  switch (r) { case "SUPER_ADMIN": return "critical" as const; case "DEPT_ADMIN": return "accent" as const; case "WORKER": return "medium" as const; case "CITIZEN": return "default" as const; default: return "default" as const; }
};

export default function AdminUsersPage() {
  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Manage user accounts and role assignments
        </p>
      </div>

      <Card padding="none">
        <div className="divide-y divide-divider">
          {users.map((user) => (
            <div key={user.id} className="px-6 py-4 hover:bg-surface-1 transition-colors flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-text-tertiary">
                <UserIcon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-text-tertiary truncate">{user.email}</p>
              </div>
              <Badge variant={roleVariant(user.role)}>{user.role.replace("_", " ")}</Badge>
              <Badge variant={user.status === "ACTIVE" ? "success" : "error"}>
                {user.status}
              </Badge>
              <span className="text-xs text-text-tertiary hidden sm:block">{user.lastLogin}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
