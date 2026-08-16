/* ════════════════════════════════════════════════════════
   Worker Portal — Mobile-First Layout
   Bottom navigation for thumb-friendly access
   ════════════════════════════════════════════════════════ */

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  WrenchIcon,
  UserIcon,
  BellIcon,
} from "@/components/ui/icons";

const workerNav = [
  { href: "/worker", label: "Tasks", icon: <WrenchIcon size={20} /> },
  { href: "/worker/notifications", label: "Alerts", icon: <BellIcon size={20} /> },
  { href: "/worker/profile", label: "Profile", icon: <UserIcon size={20} /> },
];

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/worker"
      ? pathname === "/worker"
      : pathname.startsWith(href);

  return (
    <div className="flex flex-col min-h-screen bg-canvas">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-0 sticky top-0 z-[var(--z-sticky)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <WrenchIcon size={14} className="text-white" />
          </div>
          <div>
            <span className="text-sm font-semibold block">Nagpur Connect</span>
            <span className="text-[10px] text-text-tertiary">Field Worker</span>
          </div>
        </div>
        <button className="p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-1 relative">
          <BellIcon size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-critical rounded-full" />
        </button>
      </header>

      {/* Page Content */}
      <main className="flex-1 p-4 pb-24 overflow-y-auto">{children}</main>

      {/* Bottom Navigation — Mobile-first, thumb-friendly */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface-0 border-t border-border z-[var(--z-sticky)] safe-area-bottom">
        <div className="flex items-center justify-around py-2">
          {workerNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2 px-4 rounded-lg min-w-[64px] transition-colors ${
                isActive(item.href)
                  ? "text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
