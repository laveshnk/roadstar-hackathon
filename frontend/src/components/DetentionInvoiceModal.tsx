"use client";

import type { DetentionLog, Facility, Load } from "@/lib/types";
import type { SimTruck } from "@/lib/mockData";
import { FREE_DETENTION_MINUTES, DETENTION_RATE_PER_HOUR } from "@/lib/config";
import { formatCurrency, formatDuration } from "@/lib/detention";

export default function DetentionInvoiceModal({
  log,
  truck,
  facility,
  load,
  onClose,
}: {
  log: DetentionLog;
  truck: SimTruck | undefined;
  facility: Facility | undefined;
  load: Load | undefined;
  onClose: () => void;
}) {
  const freeMinutes = Math.min(log.total_dock_minutes, FREE_DETENTION_MINUTES);
  const billableMinutes = log.billable_detention_minutes;
  const ratePerMin = DETENTION_RATE_PER_HOUR / 60;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13l2 2 4-4" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Detention Invoice</h2>
              <p className="text-[11px] text-zinc-500">
                Session {log.id} · {log.status === "ACTIVE" ? "Closed & Invoiced" : "Invoiced"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-3 px-4 py-4 text-[11px]">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Truck / Driver</div>
            <div className="mt-0.5 font-medium text-zinc-200">{truck?.truck_number ?? log.truck_id}</div>
            <div className="text-zinc-500">{truck?.driver_name ?? "—"}</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Facility</div>
            <div className="mt-0.5 font-medium text-zinc-200">{facility?.name ?? log.facility_id}</div>
            <div className="text-zinc-500">{facility?.customer ?? "—"}</div>
          </div>
        </div>

        {/* Load reference */}
        {load && (
          <div className="mx-4 mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Load</span>
              <span className="font-mono text-zinc-300">{load.id}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-zinc-500">Customer</span>
              <span className="text-zinc-300">{load.customer}</span>
            </div>
          </div>
        )}

        {/* Itemized fee breakdown */}
        <div className="mx-4 mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">Fee Breakdown</div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Total dock time</span>
              <span className="font-mono text-zinc-200">{formatDuration(log.total_dock_minutes)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Free allowance ({FREE_DETENTION_MINUTES} min)</span>
              <span className="font-mono text-zinc-500">−{formatDuration(freeMinutes)}</span>
            </div>
            <div className="my-1.5 border-t border-zinc-800" />
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-300">Billable detention</span>
              <span className="font-mono text-zinc-200">{formatDuration(billableMinutes)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Rate (@ {formatCurrency(DETENTION_RATE_PER_HOUR)}/hr)</span>
              <span className="font-mono text-zinc-500">{formatCurrency(billableMinutes * ratePerMin)}</span>
            </div>
            <div className="my-1.5 border-t border-zinc-800" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-emerald-300">Total Invoiced</span>
              <span className="font-mono text-base font-bold text-emerald-300">
                {formatCurrency(log.detention_fee_owed)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-900/80 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
