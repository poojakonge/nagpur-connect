/* ════════════════════════════════════════════════════════
   Department Stations & Facilities — /department/[code]/workers
   GeoJSON-powered facility data from /api/department/[code]/facilities
   ════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect, use } from "react";
import { Badge } from "@/components/ui";
import { DepartmentHeader } from "@/components/department/DepartmentHeader";
import { DepartmentSubNav } from "@/components/department/DepartmentSubNav";
import { DEPARTMENT_REGISTRY } from "@/lib/department-registry";

interface Facility {
  id: string;
  name: string;
  facilityType: string;
  address: string;
  zone: string;
  contactNumber: string;
  emergencyNumber: string;
  handlingCategories: string[];
  latitude?: number;
  longitude?: number;
}

export default function WorkersPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const dept = DEPARTMENT_REGISTRY[code] || { name: code, icon: "📋" };

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [criticalCount, setCriticalCount] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/department/${code}/facilities`);
        if (res.ok) {
          const d = await res.json();
          if (d.success) {
            setFacilities(d.facilities || []);
          }
        }

        const statsRes = await fetch(`/api/department/${code}/stats`);
        if (statsRes.ok) {
          const s = await statsRes.json();
          if (s.success) setCriticalCount(s.kpi.critical || 0);
        }
      } catch (err) {
        console.error("[Workers] Load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [code]);

  const filtered = facilities.filter(
    (f) =>
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.zone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 fade-in">
      <DepartmentHeader
        departmentName={dept.name}
        departmentIcon={dept.icon}
        criticalCount={criticalCount}
      />

      <DepartmentSubNav departmentCode={code} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-black text-slate-900 tracking-tight">
            Stations & Facilities
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {facilities.length} verified facilities mapped from official Nagpur geodata
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search facilities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
            🔍
          </span>
        </div>
      </div>

      {loading && (
        <div className="text-center py-16 text-slate-400">
          <div className="animate-spin inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full mb-3" />
          <p className="text-sm font-medium">Loading facility network...</p>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-2">
          <span className="text-4xl block">🏛️</span>
          <h3 className="text-base font-bold text-slate-900">
            {searchTerm
              ? "No Matching Facilities"
              : "No Facility Data Available"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchTerm
              ? "Try a different search term."
              : "GeoJSON facility data is not available for this department."}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((fac, idx) => (
            <div
              key={fac.id || idx}
              className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-sm transition-shadow space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
                      {fac.facilityType || "Facility"}
                    </span>
                    {fac.zone && (
                      <Badge variant="default" className="text-[10px]">
                        {fac.zone}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 line-clamp-2">
                    {fac.name}
                  </h3>
                </div>
              </div>

              <p className="text-xs text-slate-600 flex items-start gap-1.5">
                <span className="flex-shrink-0">📍</span>
                <span className="line-clamp-2">
                  {fac.address || "Nagpur, Maharashtra"}
                </span>
              </p>

              {(fac.contactNumber || fac.emergencyNumber) && (
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  {fac.contactNumber && (
                    <p className="text-[11px] font-mono font-bold text-slate-700 flex items-center gap-1.5">
                      <span>📞</span> {fac.contactNumber}
                    </p>
                  )}
                  {fac.emergencyNumber &&
                    fac.emergencyNumber !== fac.contactNumber && (
                      <p className="text-[11px] font-mono font-bold text-rose-700 flex items-center gap-1.5">
                        <span>🚨</span> {fac.emergencyNumber}
                      </p>
                    )}
                </div>
              )}

              {fac.handlingCategories && fac.handlingCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {fac.handlingCategories.slice(0, 3).map((cat, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
