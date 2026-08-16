/* ════════════════════════════════════════════════════════
   Category Grid — 8 clickable cards
   Uses taxonomy as single source of truth
   ════════════════════════════════════════════════════════ */

"use client";

import React from "react";
import { CATEGORIES } from "@/modules/incidents/category-taxonomy";

interface CategoryGridProps {
  onSelect: (slug: string) => void;
}

export function CategoryGrid({ onSelect }: CategoryGridProps) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-3">
        Report an Issue
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.slug}
            onClick={() => onSelect(cat.slug)}
            className="bg-surface-0 border border-border rounded-2xl p-4 text-left hover:border-accent/30 hover:shadow-sm transition-all cursor-pointer active:scale-[0.98] group"
          >
            <span className="text-2xl block mb-2">{cat.icon}</span>
            <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
              {cat.name}
            </h3>
            <p className="text-[11px] text-text-tertiary mt-0.5 line-clamp-2 leading-relaxed">
              {cat.description}
            </p>
            {cat.isEmergency && (
              <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-critical-bg text-critical">
                URGENT
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
