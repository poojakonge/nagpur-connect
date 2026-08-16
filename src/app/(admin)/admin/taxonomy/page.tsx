/* ════════════════════════════════════════════════════════
   Admin Taxonomy Management — Categories & Subcategories
   ════════════════════════════════════════════════════════ */

import { Card, Badge } from "@/components/ui";
import { WrenchIcon, PlusIcon, ChevronDownIcon } from "@/components/ui/icons";

const categories = [
  {
    name: "Road Damage",
    slug: "road-damage",
    active: true,
    subcategories: ["Pothole", "Road crack", "Speed bump damage", "Road collapse", "Missing manhole cover"],
  },
  {
    name: "Water & Drainage",
    slug: "water-drainage",
    active: true,
    subcategories: ["Water main burst", "Flooding", "Drainage blocked", "Sewage overflow", "Water contamination"],
  },
  {
    name: "Electrical Issues",
    slug: "electrical",
    active: true,
    subcategories: ["Street light outage", "Exposed wiring", "Transformer issue", "Power outage"],
  },
  {
    name: "Waste & Sanitation",
    slug: "waste-sanitation",
    active: true,
    subcategories: ["Garbage accumulation", "Illegal dumping", "Public toilet issue", "Dead animal"],
  },
  {
    name: "Traffic Issues",
    slug: "traffic",
    active: true,
    subcategories: ["Signal malfunction", "Road accident", "Illegal parking", "Road blockage"],
  },
  {
    name: "Public Safety",
    slug: "public-safety",
    active: true,
    subcategories: ["Unsafe structure", "Missing signage", "Hazardous material", "Stray animal"],
  },
  {
    name: "Environmental",
    slug: "environmental",
    active: true,
    subcategories: ["Tree fallen", "Air pollution", "Noise pollution", "Water body pollution"],
  },
  {
    name: "Fire Hazards",
    slug: "fire-hazards",
    active: true,
    subcategories: ["Active fire", "Fire risk", "Gas leak", "Smoke/fumes"],
  },
];

export default function AdminTaxonomyPage() {
  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taxonomy</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Manage incident categories, subcategories, and routing mappings
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-text-primary text-canvas rounded-pill text-sm font-medium hover:bg-[#d8d8db] transition-all">
          <PlusIcon size={16} />
          Add Category
        </button>
      </div>

      <div className="space-y-4">
        {categories.map((cat) => (
          <Card key={cat.slug} padding="none">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-text-secondary">
                  <WrenchIcon size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{cat.name}</h3>
                  <p className="text-xs text-text-tertiary font-mono">{cat.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={cat.active ? "success" : "default"}>
                  {cat.active ? "Active" : "Inactive"}
                </Badge>
                <span className="text-xs text-text-tertiary">
                  {cat.subcategories.length} subcategories
                </span>
                <ChevronDownIcon size={16} className="text-text-tertiary" />
              </div>
            </div>
            <div className="px-6 pb-4">
              <div className="flex flex-wrap gap-2">
                {cat.subcategories.map((sub) => (
                  <span
                    key={sub}
                    className="px-2.5 py-1 bg-surface-2 text-text-secondary text-xs rounded-md border border-border hover:border-border-hover transition-colors cursor-default"
                  >
                    {sub}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
