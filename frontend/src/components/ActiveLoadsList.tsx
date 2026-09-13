"use client";

import { useEffect, useState } from "react";
import type { Facility, Load, TruckStatus } from "@/lib/types";
import { LOAD_STATUS_META } from "@/lib/ui";
import { emitTutorialAction } from "./AICoPilot";

export default function ActiveLoadsList({
  loads,
  facilities,
  trucks,
  onAssignDriver,
}: {
  loads: Load[];
  facilities: Facility[];
  trucks: TruckStatus[];
  onAssignDriver?: (load: Load) => void;
}) {
  // Defer live time-based calculations until after mount to avoid SSR
  // hydration mismatches (Date.now() differs between server and client).
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const facName = (id: string) => facilities.find((f) => f.id === id)?.name ?? id;
  const truckNum = (id: string | null) =>
    id ? trucks.find((t) => t.id === id)?.truck_number ?? "—" : "Unassigned";

  // Pin expiring loads to top, then by status.
  const sortedLoads = [...loads].sort((a, b) => {
    if (!!b.is_urgent_expiring !== !!a.is_urgent_expiring) return b.is_urgent_expiring ? 1 : -1;
    return 0;
  });

  return (
    <div className="space-y-1.5">
      {sortedLoads.map((l) => {
        const meta = LOAD_STATUS_META[l.status];
        // Only compute live time after mount — on the server and during
        // initial client hydration, render a stable value (0) so the
        // server-rendered HTML matches the first client render exactly.
        const expiringMin = !mounted || !l.delivery_appointment_window
          ? 0
          : // eslint-disable-next-line react-hooks/purity
            Math.max(0, Math.round((new Date(l.delivery_appointment_window).getTime() - Date.now()) / 60000));
        return (
          <div
            key={l.id}
            className={`rounded-lg border px-3 py-2 ${
              l.is_urgent_expiring
                ? "border-rose-300 bg-rose-50 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/5"
                : "border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#1E293B]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{l.id}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}>{meta.label}</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Truck <span className="font-medium text-slate-700 dark:text-slate-300">{truckNum(l.truck_id)}</span></span>
              {!l.truck_id && onAssignDriver && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onAssignDriver(l); emitTutorialAction("OPEN_ASSIGN_MODAL"); }}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-500">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
                  Assign Driver
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="truncate">{l.origin_city ?? facName(l.origin_facility_id)}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              <span className="truncate font-medium text-slate-700 dark:text-slate-300">{l.destination_city ?? facName(l.destination_facility_id)}</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500" title={l.commodity}>{l.commodity}</p>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="truncate">{l.customer}</span>
              <span className="shrink-0">
                {l.weight_lbs != null ? `${l.weight_lbs.toLocaleString("en-CA")} lbs` : `${(l.weight_kg / 1000).toFixed(1)}t`}
                {l.pallets != null && ` · ${l.pallets} pal`}
              </span>
            </div>
            {(l.load_type || l.temperature) && (
              <div className="mt-1 flex items-center gap-1.5">
                {l.temp_controlled ? (
                  <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-2.5 w-2.5"><path d="M12 2v20M5 9l7 7 7-7" /></svg>
                    {l.temperature ?? "Reefer"}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{l.temperature ?? "Ambient"}</span>
                )}
                {l.load_type && <span className="text-[10px] text-slate-400">{l.load_type}</span>}
              </div>
            )}
            {/* Expiring appointment badge */}
            {l.is_urgent_expiring && l.delivery_appointment_window && (
              <div className="mt-1.5 flex animate-pulse items-center gap-1.5 rounded-md bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                <span suppressHydrationWarning>⏳ EXPIRING APPOINTMENT: {expiringMin}m remaining</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

