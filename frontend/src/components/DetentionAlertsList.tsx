"use client";

import type { DetentionLog, Facility, TruckStatus } from "@/lib/types";
import { FREE_DETENTION_MINUTES } from "@/lib/config";
import { formatCurrency, formatDuration } from "@/lib/detention";

export default function DetentionAlertsList({
  activeLogs,
  facilities,
  trucks,
  selectedTruckId,
  onSelect,
}: {
  activeLogs: DetentionLog[];
  facilities: Facility[];
  trucks: TruckStatus[];
  selectedTruckId: string | null;
  onSelect: (id: string) => void;
}) {
  const facName = (id: string) => facilities.find((f) => f.id === id)?.name ?? id;
  const truckNum = (id: string) =>
    trucks.find((t) => t.id === id)?.truck_number ?? id;

  const alerts = activeLogs
    .filter((l) => l.billable_detention_minutes > 0)
    .sort((a, b) => b.billable_detention_minutes - a.billable_detention_minutes);
  const watching = activeLogs.filter((l) => l.billable_detention_minutes <= 0);

  if (alerts.length === 0 && watching.length === 0) {
    return (
      <p className="px-1 text-[11px] text-slate-500 dark:text-slate-400">
        No active dock sessions.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {alerts.map((l) => {
        const selected = trucks.find((t) => t.id === l.truck_id)?.id === selectedTruckId;
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => onSelect(l.truck_id)}
            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
              selected
                ? "border-red-500 bg-red-50 dark:bg-red-500/10"
                : "border-red-200 bg-red-50 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/5 dark:hover:bg-red-500/10"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                  Detention Alert
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-red-700 dark:text-red-300">
                {formatCurrency(l.detention_fee_owed)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Truck <span className="font-medium text-slate-700 dark:text-slate-300">{truckNum(l.truck_id)}</span> · {facName(l.facility_id)}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">
                Docked {formatDuration(l.total_dock_minutes)}
              </span>
              <span className="font-medium text-red-600 dark:text-red-400">
                +{formatDuration(l.billable_detention_minutes)} billable
              </span>
            </div>
          </button>
        );
      })}

      {watching.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onSelect(l.truck_id)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-blue-400 dark:border-slate-700 dark:bg-[#1E293B] dark:hover:border-blue-500"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Truck <span className="font-medium text-slate-700 dark:text-slate-300">{truckNum(l.truck_id)}</span> · {facName(l.facility_id)}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {formatDuration(FREE_DETENTION_MINUTES - l.total_dock_minutes)} free left
            </span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-amber-400"
              style={{
                width: `${Math.min(100, (l.total_dock_minutes / FREE_DETENTION_MINUTES) * 100)}%`,
              }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}
