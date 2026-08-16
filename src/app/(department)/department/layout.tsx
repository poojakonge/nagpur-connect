/* ════════════════════════════════════════════════════════
   Department Portal — Layout with Sidebar
   ════════════════════════════════════════════════════════ */

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BuildingIcon,
  HomeIcon,
  FileTextIcon,
  WrenchIcon,
  UserIcon,
  ChartIcon,
  BellIcon,
  LogOutIcon,
  MenuIcon,
  XIcon,
} from "@/components/ui/icons";

const deptNav = [
  { href: "/department", label: "Dashboard", icon: <HomeIcon size={18} /> },
  { href: "/department/incidents", label: "Incidents", icon: <FileTextIcon size={18} /> },
  { href: "/department/tasks", label: "Tasks", icon: <WrenchIcon size={18} /> },
  { href: "/department/workers", label: "Workers", icon: <UserIcon size={18} /> },
  { href: "/department/analytics", label: "Analytics", icon: <ChartIcon size={18} /> },
];

export default function DepartmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/department" ? pathname === "/department" : pathname.startsWith(href);

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-divider">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
          <BuildingIcon size={14} className="text-white" />
        </div>
        <div>
          <span className="text-sm font-semibold block">Roads & Public Works</span>
          <span className="text-[10px] text-text-tertiary">Department Portal</span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {deptNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive(item.href)
                ? "bg-accent-muted text-accent"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-1"
            }`}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-divider space-y-1">
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-1 transition-all w-full">
          <BellIcon size={18} />
          Notifications
        </button>
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-error hover:bg-error-bg transition-all w-full">
          <LogOutIcon size={18} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="hidden lg:flex lg:flex-col w-[240px] bg-surface-0 border-r border-border flex-shrink-0 sticky top-0 h-screen">
        <SidebarContent />
      </aside>
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-[var(--z-overlay)]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-[260px] h-full bg-surface-0 border-r border-border flex flex-col slide-up">
            <button className="absolute top-4 right-3 p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-2" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
              <XIcon size={18} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-surface-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-1" aria-label="Open menu">
            <MenuIcon size={20} />
          </button>
          <span className="text-sm font-semibold">Department</span>
          <div className="w-8" />
        </header>
        <main className="flex-1 p-4 lg:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
