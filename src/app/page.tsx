/* ════════════════════════════════════════════════════════
   Nagpur Connect — Public Landing Page
   "Tell us what happened" as the primary action
   ════════════════════════════════════════════════════════ */

import Link from "next/link";
import { Navbar, Footer } from "@/components/layout/navbar";
import { DEPARTMENTS } from "@/modules/ai/department-routing";
import {
  MicrophoneIcon,
  KeyboardIcon,
  SearchIcon,
  AlertTriangleIcon,
  ShieldIcon,
  CheckCircleIcon,
  ClockIcon,
  BuildingIcon,
  SparklesIcon,
  ArrowRightIcon,
  MapIcon,
  ChartIcon,
} from "@/components/ui/icons";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        {/* ─── Hero Section ─── */}
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
          {/* Subtle gradient orbs */}
          <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-accent/3 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill bg-accent-muted border border-[rgba(77,140,245,0.15)] mb-8 fade-in">
              <SparklesIcon size={14} className="text-accent" />
              <span className="text-xs font-medium text-accent">
                AI-Powered Civic Platform
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-[-0.04em] mb-6 fade-in" style={{ animationDelay: "0.1s" }}>
              <span className="gradient-text">Tell us what happened.</span>
              <br />
              <span className="text-text-secondary font-medium text-[0.65em]">
                We&apos;ll connect you with the right help.
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-text-tertiary max-w-2xl mx-auto mb-10 leading-relaxed fade-in" style={{ animationDelay: "0.2s" }}>
              Report civic issues in Nagpur using your voice or text. Our AI understands
              your problem, identifies the responsible departments, and tracks resolution
              — so you don&apos;t have to navigate bureaucracy.
            </p>

            {/* Primary CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6 fade-in" style={{ animationDelay: "0.3s" }}>
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-3 px-8 py-4 bg-text-primary text-canvas rounded-pill text-base font-semibold hover:bg-[#d8d8db] active:bg-[#c0c0c4] transition-all shadow-lg hover:shadow-xl min-w-[220px] justify-center"
              >
                <MicrophoneIcon size={20} className="text-canvas" />
                Tell Us What Happened
                <ArrowRightIcon size={16} className="text-canvas/60 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-4 bg-surface-2 text-text-primary rounded-pill text-sm font-medium border border-border hover:bg-surface-3 hover:border-border-hover transition-all"
              >
                <KeyboardIcon size={18} />
                Type Your Report
              </Link>
            </div>

            {/* Emergency Link */}
            <div className="fade-in" style={{ animationDelay: "0.4s" }}>
              <Link
                href="/emergency"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-critical hover:text-critical/80 transition-colors"
              >
                <AlertTriangleIcon size={16} />
                Life-threatening emergency? Get immediate help
              </Link>
            </div>

            {/* Track existing report */}
            <div className="mt-12 fade-in" style={{ animationDelay: "0.5s" }}>
              <Link
                href="/track"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-text-tertiary hover:text-text-secondary bg-surface-1 rounded-pill border border-border hover:border-border-hover transition-all"
              >
                <SearchIcon size={16} />
                Already filed a report? Track it here
              </Link>
            </div>
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section className="py-24 border-t border-divider">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-3 tracking-tight">
                How Nagpur Connect Works
              </h2>
              <p className="text-text-tertiary max-w-lg mx-auto">
                From your report to resolution — powered by AI, managed by the right departments.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                {
                  step: "01",
                  icon: <MicrophoneIcon size={24} />,
                  title: "Describe the Problem",
                  desc: "Use your voice or type. No need to know which department handles it.",
                },
                {
                  step: "02",
                  icon: <SparklesIcon size={24} />,
                  title: "AI Understands",
                  desc: "Our AI analyzes your report, identifies severity, and suggests the right departments.",
                },
                {
                  step: "03",
                  icon: <CheckCircleIcon size={24} />,
                  title: "Review & Confirm",
                  desc: "See a clear summary of what we understood. Edit if needed, then confirm to submit.",
                },
                {
                  step: "04",
                  icon: <BuildingIcon size={24} />,
                  title: "Departments Act",
                  desc: "Relevant departments receive your report, assign workers, and resolve the issue.",
                },
              ].map((item, i) => (
                <div
                  key={item.step}
                  className="relative bg-surface-1 border border-border rounded-card p-6 hover:border-border-hover transition-all group"
                >
                  {/* Step number */}
                  <span className="absolute top-4 right-4 text-xs font-mono text-text-tertiary/50">
                    {item.step}
                  </span>
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-xl bg-accent-muted flex items-center justify-center mb-4 text-accent group-hover:bg-accent-subtle transition-colors">
                    {item.icon}
                  </div>
                  <h3 className="text-base font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-text-tertiary leading-relaxed">{item.desc}</p>

                  {/* Connector line (desktop) */}
                  {i < 3 && (
                    <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-border" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── What You Can Report ─── */}
        <section className="py-24 border-t border-divider bg-surface-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-3 tracking-tight">
                What You Can Report
              </h2>
              <p className="text-text-tertiary max-w-lg mx-auto">
                From potholes to emergencies — one platform that routes to every relevant department.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {DEPARTMENTS.map((dept) => (
                <div
                  key={dept.code}
                  className="bg-surface-1 border border-border rounded-lg p-4 text-center hover:border-accent-muted hover:bg-surface-2 transition-all cursor-default"
                >
                  <div className="text-2xl mb-2">{dept.icon || "🏢"}</div>
                  <span className="text-sm font-medium text-text-secondary">{dept.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Platform Features ─── */}
        <section className="py-24 border-t border-divider">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-3 tracking-tight">
                Built for Everyone
              </h2>
              <p className="text-text-tertiary max-w-lg mx-auto">
                Dedicated portals for citizens, departments, workers, and city administration.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: <ShieldIcon size={24} />,
                  title: "City Command Centre",
                  desc: "Real-time incident map, KPI dashboards, department workload, and full audit trail for city administrators.",
                  tag: "Admin",
                },
                {
                  icon: <BuildingIcon size={24} />,
                  title: "Department Dispatch",
                  desc: "Triage incoming incidents, assign workers, verify resolution evidence, and manage department operations.",
                  tag: "Department",
                },
                {
                  icon: <MapIcon size={24} />,
                  title: "Worker Mobile Portal",
                  desc: "Mobile-first task queue, navigation to site, before/after photo evidence, and clear action sequences.",
                  tag: "Worker",
                },
              ].map((feat) => (
                <div
                  key={feat.title}
                  className="gradient-card p-6 hover:border-border-hover transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center text-text-secondary">
                      {feat.icon}
                    </div>
                    <span className="text-xs font-medium text-text-tertiary bg-surface-2 px-2.5 py-1 rounded-pill">
                      {feat.tag}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feat.title}</h3>
                  <p className="text-sm text-text-tertiary leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Stats / Trust ─── */}
        <section className="py-20 border-t border-divider bg-surface-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { value: "24/7", label: "Available" },
                { value: "AI", label: "Powered Analysis" },
                { value: "Multi", label: "Department Routing" },
                { value: "Secure", label: "Privacy Controls" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-3xl font-bold text-text-primary mb-1 tracking-tight">
                    {stat.value}
                  </div>
                  <div className="text-sm text-text-tertiary">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA Section ─── */}
        <section className="py-24 border-t border-divider">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="gradient-card p-12 sm:p-16">
              <h2 className="text-3xl font-bold mb-4 tracking-tight">
                Ready to Report an Issue?
              </h2>
              <p className="text-text-tertiary max-w-md mx-auto mb-8">
                It takes less than 2 minutes. Just describe what happened and we&apos;ll handle the rest.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/report"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-text-primary text-canvas rounded-pill text-base font-semibold hover:bg-[#d8d8db] transition-all shadow-lg"
                >
                  <MicrophoneIcon size={20} className="text-canvas" />
                  Start Reporting
                </Link>
                <Link
                  href="/track"
                  className="inline-flex items-center gap-2 px-6 py-4 bg-surface-2 text-text-primary rounded-pill text-sm font-medium border border-border hover:bg-surface-3 transition-all"
                >
                  <SearchIcon size={18} />
                  Track Existing Report
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
