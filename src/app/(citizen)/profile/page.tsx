/* ════════════════════════════════════════════════════════
   Citizen Profile Page
   Name, avatar, preferences, report stats
   ════════════════════════════════════════════════════════ */

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CitizenHeader } from "@/components/citizen/citizen-header";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getOrCreateGuestId, citizenHeaders } from "@/lib/guest-id";

export default function ProfilePage() {
  const router = useRouter();
  const [reportCount, setReportCount] = useState(0);
  const [name, setName] = useState("Citizen User");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    // Load saved name from localStorage
    const savedName = localStorage.getItem("nagpur_connect_name");
    if (savedName) setName(savedName);

    // Initialize guest identity then get report count
    getOrCreateGuestId().then(() => {
      fetch("/api/incidents/mine", { headers: citizenHeaders() })
        .then((r) => r.json())
        .then((d) => setReportCount(d.incidents?.length || 0))
        .catch(() => {});
    });
  }, []);

  const saveName = () => {
    localStorage.setItem("nagpur_connect_name", name);
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-canvas">
      <CitizenHeader />

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Profile card */}
        <div className="bg-surface-0 border border-border rounded-2xl overflow-hidden shadow-sm mb-5">
          {/* Banner */}
          <div className="h-24 bg-gradient-to-br from-accent to-accent-hover relative">
            <div className="absolute -bottom-8 left-5">
              <div className="w-16 h-16 rounded-full bg-surface-0 border-4 border-surface-0 flex items-center justify-center text-accent text-xl font-bold shadow-lg">
                {name.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

          <div className="pt-12 pb-5 px-5">
            {isEditing ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-lg font-bold text-text-primary bg-surface-1 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                />
                <button
                  onClick={saveName}
                  className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-text-primary">{name}</h1>
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-7 h-7 rounded-full hover:bg-surface-2 flex items-center justify-center cursor-pointer"
                  aria-label="Edit name"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>
            )}
            <p className="text-sm text-text-tertiary">Nagpur, Maharashtra</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className="bg-surface-0 border border-border rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-accent">{reportCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mt-1">
              Reports
            </p>
          </div>
          <div className="bg-surface-0 border border-border rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-success">0</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mt-1">
              Resolved
            </p>
          </div>
          <div className="bg-surface-0 border border-border rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-medium">0</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mt-1">
              In Progress
            </p>
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Settings
          </h2>

          {/* Theme */}
          <div className="bg-surface-0 border border-border rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-surface-1 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Theme</p>
                <p className="text-xs text-text-tertiary">Switch between light and dark</p>
              </div>
            </div>
            <ThemeToggle />
          </div>

          {/* Language */}
          <div className="bg-surface-0 border border-border rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-surface-1 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Language</p>
                <p className="text-xs text-text-tertiary">English (India)</p>
              </div>
            </div>
            <span className="text-xs text-text-tertiary bg-surface-1 px-2.5 py-1 rounded-full">EN</span>
          </div>

          {/* Notifications */}
          <div className="bg-surface-0 border border-border rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-surface-1 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Notifications</p>
                <p className="text-xs text-text-tertiary">Report status updates</p>
              </div>
            </div>
            <span className="text-xs text-success bg-success-bg px-2.5 py-1 rounded-full font-medium">On</span>
          </div>
        </div>

        {/* Quick links */}
        <div className="mt-6 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Quick Links
          </h2>
          <button
            onClick={() => router.push("/my-reports")}
            className="w-full bg-surface-0 border border-border rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-accent/30 transition-colors"
          >
            <span className="text-sm font-medium text-text-primary">View All My Reports</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-tertiary">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full bg-surface-0 border border-border rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-accent/30 transition-colors"
          >
            <span className="text-sm font-medium text-text-primary">Report New Issue</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-tertiary">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* Emergency info */}
        <div className="mt-6 bg-critical-bg border border-critical-border rounded-2xl p-4">
          <h3 className="text-sm font-bold text-critical mb-2">🚨 Emergency Numbers</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Emergency", number: "112" },
              { label: "Police", number: "100" },
              { label: "Fire", number: "101" },
              { label: "Ambulance", number: "108" },
            ].map((e) => (
              <a
                key={e.number}
                href={`tel:${e.number}`}
                className="flex items-center gap-2 bg-surface-0/50 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-surface-0 transition-colors"
              >
                <span className="text-lg">📞</span>
                <div>
                  <p className="text-xs font-medium text-text-primary">{e.label}</p>
                  <p className="text-sm font-bold text-critical">{e.number}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
