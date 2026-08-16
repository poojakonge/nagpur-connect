/* ════════════════════════════════════════════════════════
   Admin Settings Page
   ════════════════════════════════════════════════════════ */

import { Card } from "@/components/ui";
import { SettingsIcon, ShieldIcon, BellIcon, MapIcon } from "@/components/ui/icons";

const settingGroups = [
  {
    title: "Platform",
    items: [
      { label: "App Origin", value: "http://localhost:3000", desc: "Base URL for the platform" },
      { label: "AI Provider", value: "fixture", desc: "AI analysis provider (fixture for demo)" },
      { label: "Map Provider", value: "leaflet", desc: "Map rendering engine" },
    ],
  },
  {
    title: "Notifications",
    items: [
      { label: "Notification Provider", value: "console", desc: "Delivery channel for notifications" },
      { label: "Email Enabled", value: "No", desc: "Requires approved provider account" },
      { label: "SMS Enabled", value: "No", desc: "Requires approved provider account" },
    ],
  },
  {
    title: "Security",
    items: [
      { label: "Session Expiry", value: "24 hours", desc: "Maximum session duration" },
      { label: "Login Rate Limit", value: "5 attempts / 15 min", desc: "Per-IP rate limiting" },
      { label: "Activation Code Expiry", value: "24 hours", desc: "Default code validity" },
    ],
  },
];

export default function AdminSettingsPage() {
  return (
    <div className="space-y-8 fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Platform configuration and system settings
        </p>
      </div>

      {settingGroups.map((group) => (
        <Card key={group.title} padding="none">
          <div className="px-6 py-4 border-b border-divider">
            <h2 className="text-base font-semibold">{group.title}</h2>
          </div>
          <div className="divide-y divide-divider">
            {group.items.map((item) => (
              <div key={item.label} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">{item.desc}</p>
                </div>
                <span className="text-sm text-text-secondary font-mono bg-surface-2 px-3 py-1 rounded">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
