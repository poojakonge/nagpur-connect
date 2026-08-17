/* ════════════════════════════════════════════════════════
   Admin Portal — Sidebar Navigation Layout
   Persistent side-rail for desktop, drawer for mobile
   ════════════════════════════════════════════════════════ */

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  ShieldIcon,
  HomeIcon,
  MapIcon,
  FileTextIcon,
  BuildingIcon,
  UserIcon,
  SettingsIcon,
  ChartIcon,
  BellIcon,
  LogOutIcon,
  MenuIcon,
  XIcon,
  ClockIcon,
  WrenchIcon,
} from "@/components/ui/icons";

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: <HomeIcon size={18} /> },
  { href: "/admin/map", label: "Incident Map", icon: <MapIcon size={18} /> },
  { href: "/admin/incidents", label: "Incidents", icon: <FileTextIcon size={18} /> },
  { href: "/admin/departments", label: "Departments", icon: <BuildingIcon size={18} /> },
  { href: "/admin/users", label: "Citizens & Users", icon: <UserIcon size={18} /> },
  { href: "/admin/taxonomy", label: "Taxonomy", icon: <WrenchIcon size={18} /> },
  { href: "/admin/analytics", label: "Analytics", icon: <ChartIcon size={18} /> },
  { href: "/admin/audit", label: "Audit Log", icon: <ClockIcon size={18} /> },
  { href: "/admin/settings", label: "Settings", icon: <SettingsIcon size={18} /> },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/dashboard" });
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-divider">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shadow-md">
            <ShieldIcon size={16} className="text-white" />
          </div>
          <div>
            <span className="text-sm font-bold block text-text-primary">Nagpur Connect</span>
            <span className="text-[10px] text-text-tertiary font-medium">City Command Portal</span>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {adminNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`
              flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold
              transition-all duration-[var(--transition-fast)]
              ${
                isActive(item.href)
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-1"
              }
            `}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-divider space-y-1.5 bg-surface-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-text-tertiary hover:text-accent hover:bg-accent/5 transition-all w-full"
        >
          <span>🌐</span>
          <span>Switch to Citizen View</span>
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-critical hover:bg-critical-bg transition-all w-full cursor-pointer"
        >
          <LogOutIcon size={16} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-[250px] bg-surface-0 border-r border-border flex-shrink-0 sticky top-0 h-screen z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-[280px] h-full bg-surface-0 border-r border-border flex flex-col slide-up shadow-2xl">
            <button
              className="absolute top-4 right-3 p-1.5 rounded-full text-text-tertiary hover:text-text-primary hover:bg-surface-2 cursor-pointer"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <XIcon size={18} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-surface-0/95 backdrop-blur-md sticky top-0 z-40">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-1 cursor-pointer"
            aria-label="Open menu"
          >
            <MenuIcon size={20} />
          </button>
          <span className="text-sm font-bold text-accent">Nagpur Connect Admin</span>
          <ThemeToggle />
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
