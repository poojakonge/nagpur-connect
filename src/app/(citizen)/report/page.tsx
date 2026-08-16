/* ════════════════════════════════════════════════════════
   /report — Redirect to citizen dashboard
   The report flow is integrated into the dashboard
   ════════════════════════════════════════════════════════ */

import { redirect } from "next/navigation";

export default function ReportPage() {
  redirect("/dashboard");
}
