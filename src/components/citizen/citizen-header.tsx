/* ════════════════════════════════════════════════════════
   CitizenHeader — Mobile-first top bar with navigation
   Brand · Nav Tabs · Profile · Theme Toggle
   Slide-out mobile menu
   ════════════════════════════════════════════════════════ */

"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationBell } from "@/components/citizen/notification-bell";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/my-reports", label: "My Reports", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { href: "/profile", label: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
];

export function CitizenHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session, status } = useSession();

  const user = session?.user;
  const isAuth = status === "authenticated" && !!user;

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname?.startsWith("/dashboard/");
    return pathname?.startsWith(href);
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-surface-0/90 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 max-w-3xl mx-auto">
          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-2 transition-colors cursor-pointer lg:hidden"
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Brand */}
          <button
            onClick={() => router.push("/dashboard")}
            className="text-lg font-bold tracking-tight text-accent cursor-pointer"
          >
            Nagpur Connect
          </button>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  isActive(item.href)
                    ? "bg-accent/10 text-accent"
                    : "text-text-tertiary hover:text-text-primary hover:bg-surface-1"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
            {isAuth ? (
              <button
                onClick={() => router.push("/profile")}
                className="w-9 h-9 rounded-full overflow-hidden cursor-pointer hover:ring-2 ring-accent transition-all"
                aria-label="User profile"
                title={user?.name || "Profile"}
              >
                {user?.image ? (
                  <img src={user.image} alt={user.name || ""} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-accent/10 flex items-center justify-center text-accent text-sm font-semibold">
                    {(user?.name || "U").charAt(0).toUpperCase()}
                  </div>
                )}
              </button>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="px-3 py-1.5 rounded-full bg-accent text-white text-xs font-semibold cursor-pointer hover:bg-accent/90 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile slide-out menu */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-50 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
          {/* Panel */}
          <div className="fixed left-0 top-0 bottom-0 w-72 bg-surface-0 z-50 shadow-2xl lg:hidden animate-slideIn">
            {/* Menu header */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-border">
              <span className="text-lg font-bold text-accent">Menu</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-9 h-9 rounded-full hover:bg-surface-2 flex items-center justify-center cursor-pointer"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User section */}
            <div className="px-5 py-5 border-b border-border">
              <div className="flex items-center gap-3">
                {isAuth && user?.image ? (
                  <img src={user.image} alt={user.name || ""} className="w-11 h-11 rounded-full object-cover" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-base">
                    {isAuth ? (user?.name || "U").charAt(0).toUpperCase() : "U"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {isAuth ? user?.name || "Citizen" : "Guest User"}
                  </p>
                  <p className="text-xs text-text-tertiary truncate">
                    {isAuth ? user?.email || "Nagpur, Maharashtra" : "Nagpur, Maharashtra"}
                  </p>
                </div>
              </div>
              {isAuth ? (
                <button
                  onClick={() => signOut()}
                  className="mt-3 w-full px-3 py-2 rounded-xl text-xs font-semibold text-critical bg-critical-bg border border-critical-border cursor-pointer hover:bg-critical/10 transition-colors"
                >
                  Sign Out
                </button>
              ) : (
                <button
                  onClick={() => signIn("google")}
                  className="mt-3 w-full px-3 py-2 rounded-xl text-xs font-semibold text-white bg-accent cursor-pointer hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  Sign in with Google
                </button>
              )}
            </div>

            {/* Nav links */}
            <nav className="py-3">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.href}
                  onClick={() => {
                    router.push(item.href);
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left cursor-pointer transition-colors ${
                    isActive(item.href)
                      ? "bg-accent/8 text-accent"
                      : "text-text-secondary hover:bg-surface-1"
                  }`}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={item.icon} />
                  </svg>
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              ))}

              {/* Divider */}
              <div className="border-t border-border my-3 mx-5" />

              {/* Emergency line */}
              <div className="px-5 py-3">
                <div className="bg-critical-bg border border-critical-border rounded-xl p-3">
                  <p className="text-xs font-bold text-critical mb-1">🚨 Emergency?</p>
                  <p className="text-xs text-text-secondary">Call 112 for immediate help</p>
                  <a
                    href="tel:112"
                    className="inline-block mt-2 px-4 py-1.5 bg-critical text-white rounded-full text-xs font-bold cursor-pointer"
                  >
                    Call 112
                  </a>
                </div>
              </div>

              {/* Track report */}
              <div className="px-5 py-2">
                <div className="bg-surface-1 border border-border rounded-xl p-3">
                  <p className="text-xs font-semibold text-text-primary mb-2">Track a Report</p>
                  <div className="flex gap-2">
                    <input
                      id="track-report-input"
                      type="text"
                      placeholder="NAG-2026-XXXXXX"
                      className="flex-1 text-xs bg-surface-0 border border-border rounded-lg px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) {
                            router.push(`/dashboard/${val}`);
                            setMenuOpen(false);
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById("track-report-input") as HTMLInputElement;
                        const val = input?.value?.trim();
                        if (val) {
                          router.push(`/dashboard/${val}`);
                          setMenuOpen(false);
                        }
                      }}
                      className="px-3 py-2 bg-accent text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-accent-hover transition-colors"
                    >
                      Go
                    </button>
                  </div>
                </div>
              </div>
            </nav>

            {/* Footer */}
            <div className="absolute bottom-0 left-0 right-0 px-5 py-4 border-t border-border bg-surface-0">
              <p className="text-[10px] text-text-tertiary text-center">
                Nagpur Connect v1.0 — AI-Powered Civic Response
              </p>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slideIn {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </>
  );
}
