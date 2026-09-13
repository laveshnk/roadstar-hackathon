"use client";

import type { Facility } from "@/lib/types";
import type { SimTruck } from "@/lib/mockData";
import { formatKm, formatSpeed } from "@/lib/geo";
import StatusBadge from "./StatusBadge";

export default function FleetStatusList({
  trucks,
  facilities,
  selectedTruckId,
  onSelect,
  alertTruckIds,
}: {
  trucks: SimTruck[];
  facilities: Facility[];
  selectedTruckId: string | null;
  onSelect: (id: string) => void;
  alertTruckIds: Set<string>;
}) {
  const fac = (id: string | null) => facilities.find((f) => f.id === id);
  const activeFacility = fac;

  /** Trucks delivering to London or Cambridge are eligible for a backhaul
   *  recommendation — a return load heading toward Milton/GTA to eliminate
   *  empty deadhead miles. */
  const isBackhaulEligible = (destId: string): boolean => {
    const f = fac(destId);
    if (!f) return false;
    const name = f.name.toLowerCase();
    return name.includes("london") || name.includes("cambridge");
  };

  return (
    <div className="space-y-1.5">
      {trucks.map((t) => {
        const selected = t.id === selectedTruckId;
        const alert = alertTruckIds.has(t.id);
        const dockFac = t.current_facility_id ? activeFacility(t.current_facility_id) : null;
        const destFac = t.destination_facility_id ? activeFacility(t.destination_facility_id) : null;

        let sublabel = "";
        if (t.current_status === "DOCKED_WAITING" && dockFac) {
          sublabel = `Docked · ${dockFac.name}`;
        } else if (t.current_status === "IN_TRANSIT" && destFac) {
          sublabel = `En route → ${destFac.name}`;
        } else if (t.current_status === "OFF_DUTY" && dockFac) {
          sublabel = `Off-duty · ${dockFac.name}`;
        }

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`group w-full rounded-lg border px-3 py-2 text-left transition-colors ${
              selected
                ? "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10"
                : "border-slate-200 bg-white shadow-sm hover:border-blue-400 dark:border-slate-700 dark:bg-[#1E293B] dark:hover:border-blue-500"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 px-1 text-[11px] font-bold text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                  {t.truck_number}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t.driver_name}
                    </span>
                    {alert && (
                      <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20">
                        <span className="h-1 w-1 animate-pulse rounded-full bg-red-500" />
                        DETENTION
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{sublabel}</p>
                  {t.current_status === "IN_TRANSIT" &&
                    t.destination_facility_id &&
                    isBackhaulEligible(t.destination_facility_id) && (
                      <span
                        className="mt-1 inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20"
                        title="Backhaul opportunity: return load to Milton/GTA eliminates empty deadhead miles"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-2.5 w-2.5">
                          <path d="M3 12l4-4v3h10V8l4 4-4 4v-3H7v3z" />
                        </svg>
                        Recommended Backhaul
                      </span>
                    )}
                </div>
              </div>
              <StatusBadge status={t.current_status} />
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
              <span className="inline-flex items-center gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 text-slate-400 dark:text-slate-500">
                  <path d="M12 2v20M5 9l7-7 7 7" />
                </svg>
                {t.current_status === "IN_TRANSIT" ? formatSpeed(t.speed) : "0 km/h"}
              </span>
              <span className="inline-flex items-center gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 text-slate-400 dark:text-slate-500">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {formatKm(t.odometer)}
              </span>
              {t.hos_remaining_hours != null && (
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    t.hos_remaining_hours < 8
                      ? "text-red-600 dark:text-red-400"
                      : t.hos_remaining_hours < 20
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                  }`}
                  title="Canadian HOS Cycle 1 (70h / 7-day) remaining"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
                    <rect x="2" y="7" width="16" height="10" rx="2" />
                    <path d="M22 10v4M6 7V5h8v2" />
                  </svg>
                  {t.hos_remaining_hours.toFixed(1)}h
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
