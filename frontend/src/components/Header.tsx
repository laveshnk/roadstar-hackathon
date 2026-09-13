"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/detention";
import type { ConnectionStatus } from "@/lib/types";

export interface FleetStats {
  online: number;
  total: number;
  inTransit: number;
  docked: number;
  offDuty: number;
  alerts: number;
  unbilled: number;
  billedMtd: number;
}

/** Status chip for the Level-1 header. */
function Chip({
  label, value, tone = "default",
}: {
  label: string; value: string;
  tone?: "default" | "amber" | "red" | "emerald" | "blue" | "indigo";
}) {
  const tones: Record<string, string> = {
    default: "bg-slate-100 text-slate-600 ring-slate-200",
    amber: "bg-amber-100 text-amber-700 ring-amber-200",
    red: "bg-rose-100 text-rose-700 ring-rose-200",
    emerald: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    blue: "bg-blue-100 text-blue-700 ring-blue-200",
    indigo: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  };
  return (
    <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 ring-1 ring-inset ${tones[tone]}`}>
      <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">{label}</span>
      <span className="text-xs font-bold tabular-nums">{value}</span>
    </div>
  );
}

/** Only 3 tabs — the Driver Portal lives independently on port 5174. */
export type TabId = "map" | "dispatch" | "detention";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  {
    id: "map", label: "Live Map & Fleet",
    icon: (<path d="M9 20l-5.5-2.5V4L9 6.5m0 13.5l6-2.5m-6 2.5V6.5m6 11L21 15V2l-6 2.5M15 13.5V4.5" />),
  },
  {
    id: "dispatch", label: "Dispatch & Pre-Audit",
    icon: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>),
  },
  {
    id: "detention", label: "Detention & Invoices",
    icon: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13l2 2 4-4" /></>),
  },
];

export default function Header({
  stats, now, activeTab, onTabChange, connectionStatus, demoMode, onToggleDemo,
}: {
  stats: FleetStats; now: number; activeTab: TabId; onTabChange: (tab: TabId) => void;
  connectionStatus: ConnectionStatus; demoMode: boolean; onToggleDemo: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("apex-theme") : null;
    const systemDark = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
    const isDark = stored === "dark" || (!stored && systemDark);
    if (isDark) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);
  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", next);
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("apex-theme", next ? "dark" : "light");
    }
  };
  const time = new Date(now).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const date = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "2-digit" });

  return (
    <div className="sticky top-0 z-[1200] shrink-0">
      {/* ===== Level-1: Branding + Status Chips (56px) ===== */}
      <header className="flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 shadow-sm dark:border-slate-800 dark:bg-[#0F172A]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <svg viewBox="0 0 64 64" fill="none" className="h-5 w-5">
              <path d="M8 48 L24 16 H40 L56 48" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="48" r="4" fill="#059669" />
              <circle cx="32" cy="16" r="4" fill="white" />
              <circle cx="52" cy="48" r="4" fill="#e11d48" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">Apex Corridor Systems</h1>
            <p className="text-[10px] leading-tight text-slate-400 dark:text-slate-500">Automated Regional Dispatch Command</p>
          </div>
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          <Chip label="Online" value={`${stats.online}/${stats.total}`} tone="blue" />
          <Chip label="In-Transit" value={String(stats.inTransit)} tone="indigo" />
          <Chip label="Docked" value={String(stats.docked)} tone="amber" />
          <Chip label="Alerts" value={String(stats.alerts)} tone="red" />
          <Chip label="Unbilled" value={mounted ? formatCurrency(stats.unbilled) : "—"} tone="red" />
          <Chip label="Billed MTD" value={mounted ? formatCurrency(stats.billedMtd) : "—"} tone="emerald" />
        </div>
        <div className="flex items-center gap-3">
          {/* Engine connectivity badge */}
          {connectionStatus === "CONNECTED" ? (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              SIM ENGINE LIVE (Port 4001)
            </div>
          ) : connectionStatus === "CONNECTING" ? (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              CONNECTING…
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold text-rose-700 ring-1 ring-inset ring-rose-200">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              SIM ENGINE OFFLINE (Port 4001)
            </div>
          )}
          {/* Demo mode toggle (for offline presentations) */}
          <button type="button" onClick={onToggleDemo} title="Toggle mock fallback mode for offline demos"
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset transition-colors ${demoMode ? "bg-blue-100 text-blue-700 ring-blue-200" : "bg-slate-100 text-slate-400 ring-slate-200 hover:text-slate-600"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            {demoMode ? "Mock: ON" : "Mock: OFF"}
          </button>
          {/* Dark mode toggle (Sun / Moon) */}
          <button type="button" onClick={toggleTheme} title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:bg-[#1F2937] dark:text-amber-300 dark:ring-[#374151]">
            {darkMode ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
            )}
          </button>
          <div className="text-right">
            <div suppressHydrationWarning className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {mounted ? time : "--:--:--"}
            </div>
            <div suppressHydrationWarning className="text-[10px] text-slate-400 dark:text-slate-500">
              {mounted ? `${date} · ET` : "—"}
            </div>
          </div>
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${connectionStatus === "CONNECTED" || demoMode ? "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20" : "bg-slate-100 text-slate-400 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:ring-slate-600"}`}>
            <span className="relative flex h-2 w-2">
              {(connectionStatus === "CONNECTED" || demoMode) && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${connectionStatus === "CONNECTED" || demoMode ? "bg-emerald-500" : "bg-slate-400"}`} />
            </span>
            LIVE
          </div>
        </div>
      </header>
      {/* ===== Level-2: Tab Ribbon (44px) ===== */}
      <nav className="flex h-11 items-center gap-1 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-[#0F172A]">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-1.5 text-xs font-bold transition-all ${active ? "text-blue-600" : "text-slate-400 hover:text-slate-600"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">{tab.icon}</svg>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
              {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-blue-600" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
