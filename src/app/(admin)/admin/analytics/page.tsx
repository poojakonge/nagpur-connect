/* ════════════════════════════════════════════════════════
   Admin Analytics — Aggregate KPI views
   ════════════════════════════════════════════════════════ */

import { Card } from "@/components/ui";
import { ChartIcon } from "@/components/ui/icons";

const metrics = [
  { label: "Avg Response Time", value: "2.3 hrs", change: "↓ 15% from last month" },
  { label: "Avg Resolution Time", value: "18.5 hrs", change: "↓ 8% from last month" },
  { label: "Citizen Satisfaction", value: "4.2/5", change: "↑ 0.3 from last month" },
  { label: "Escalation Rate", value: "6.2%", change: "↓ 2.1% from last month" },
];

const categoryBreakdown = [
  { category: "Road Damage", count: 342, pct: 27 },
  { category: "Water & Drainage", count: 215, pct: 17 },
  { category: "Waste & Sanitation", count: 198, pct: 16 },
  { category: "Electrical", count: 176, pct: 14 },
  { category: "Traffic", count: 134, pct: 11 },
  { category: "Environmental", count: 89, pct: 7 },
  { category: "Public Safety", count: 56, pct: 5 },
  { category: "Other", count: 37, pct: 3 },
];

const trendData = [
  { month: "Mar", incidents: 145 },
  { month: "Apr", incidents: 178 },
  { month: "May", incidents: 156 },
  { month: "Jun", incidents: 201 },
  { month: "Jul", incidents: 189 },
  { month: "Aug", incidents: 212 },
];

export default function AdminAnalyticsPage() {
  const maxIncidents = Math.max(...trendData.map((d) => d.incidents));

  return (
    <div className="space-y-8 fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Aggregate performance metrics and incident trends
        </p>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label} padding="md" variant="elevated">
            <p className="text-xs text-text-tertiary uppercase tracking-wider">{m.label}</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{m.value}</p>
            <p className="text-xs text-success mt-1">{m.change}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <Card padding="md">
          <h2 className="text-base font-semibold mb-4">Incidents by Category</h2>
          <div className="space-y-3">
            {categoryBreakdown.map((cat) => (
              <div key={cat.category}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-text-secondary">{cat.category}</span>
                  <span className="text-text-tertiary">
                    {cat.count} ({cat.pct}%)
                  </span>
                </div>
                <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${cat.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Trend Chart (CSS bars) */}
        <Card padding="md">
          <h2 className="text-base font-semibold mb-4">Monthly Incident Trend</h2>
          <div className="flex items-end justify-between h-48 gap-2">
            {trendData.map((d) => (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-text-tertiary">{d.incidents}</span>
                <div
                  className="w-full bg-accent/20 rounded-t-md relative overflow-hidden hover:bg-accent/30 transition-colors"
                  style={{ height: `${(d.incidents / maxIncidents) * 100}%` }}
                >
                  <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-accent/40 rounded-t-md" />
                </div>
                <span className="text-xs text-text-tertiary mt-1">{d.month}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
