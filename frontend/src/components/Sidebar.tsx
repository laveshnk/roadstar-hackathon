"use client";

import type { DetentionLog, Facility, Load } from "@/lib/types";
import type { SimTruck } from "@/lib/mockData";
import FleetStatusList from "./FleetStatusList";
import ActiveLoadsList from "./ActiveLoadsList";
import DetentionAlertsList from "./DetentionAlertsList";

function SectionTitle({
  title,
  count,
  tone = "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
}: {
  title: string;
  count: string | number;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between px-1 pb-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h3>
      <span
        className={`min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold ${tone}`}
      >
        {count}
      </span>
    </div>
  );
}

function RailIcon({
  label,
  count,
  danger,
  onClick,
}: {
  label: string;
  count: number;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label}: ${count}`}
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <span
        className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
          danger && count > 0
            ? "bg-red-500 text-white"
            : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
        }`}
      >
        {count}
      </span>
      <span className="text-[9px] font-semibold uppercase">{label.slice(0, 1)}</span>
    </button>
  );
}

export default function Sidebar({
  open,
  onToggle,
  trucks,
  facilities,
  loads,
  activeDetentionLogs,
  selectedTruckId,
  onSelectTruck,
  alertTruckIds,
  onAssignDriver,
}: {
  open: boolean;
  onToggle: () => void;
  trucks: SimTruck[];
  facilities: Facility[];
  loads: Load[];
  activeDetentionLogs: DetentionLog[];
  selectedTruckId: string | null;
  onSelectTruck: (id: string) => void;
  alertTruckIds: Set<string>;
  onAssignDriver?: (load: Load) => void;
}) {
  const onlineCount = trucks.filter((t) => t.current_status !== "OFF_DUTY").length;
  const alertsCount = activeDetentionLogs.filter(
    (l) => l.billable_detention_minutes > 0,
  ).length;

  const Chevron = open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );

  return (
    <aside
      className={`flex h-full flex-col border-r border-slate-200 bg-slate-50 transition-[width] duration-300 ease-in-out dark:border-slate-800 dark:bg-[#0F172A] ${
        open ? "w-96" : "w-14"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
        {open && (
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Operations</h2>
        )}
        <button
          type="button"
          onClick={onToggle}
          title={open ? "Collapse sidebar" : "Expand sidebar"}
          className={`flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
            open ? "ml-auto" : "mx-auto"
          }`}
        >
          {Chevron}
        </button>
      </div>

      {open ? (
        <div className="flex-1 space-y-5 overflow-y-auto p-3">
          <section>
            <SectionTitle
              title="Fleet Status"
              count={`${onlineCount}/${trucks.length}`}
              tone="bg-blue-500/20 text-blue-300 dark:bg-blue-500/10 dark:text-blue-400"
            />
            <FleetStatusList
              trucks={trucks}
              facilities={facilities}
              selectedTruckId={selectedTruckId}
              onSelect={onSelectTruck}
              alertTruckIds={alertTruckIds}
            />
          </section>
          <section>
            <SectionTitle title="Active Loads" count={loads.length} />
            <ActiveLoadsList
              loads={loads}
              facilities={facilities}
              trucks={trucks}
              onAssignDriver={onAssignDriver}
            />
          </section>
          <section>
            <SectionTitle
              title="Detention Alerts"
              count={alertsCount}
              tone={
                alertsCount > 0
                  ? "bg-red-500/20 text-red-300 dark:bg-red-500/10 dark:text-red-400"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300"
              }
            />
            <DetentionAlertsList
              activeLogs={activeDetentionLogs}
              facilities={facilities}
              trucks={trucks}
              selectedTruckId={selectedTruckId}
              onSelect={onSelectTruck}
            />
          </section>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-3 py-3">
          <RailIcon label="Fleet" count={onlineCount} onClick={onToggle} />
          <RailIcon label="Loads" count={loads.length} onClick={onToggle} />
          <RailIcon
            label="Alerts"
            count={alertsCount}
            danger
            onClick={onToggle}
          />
        </div>
      )}
    </aside>
  );
}
