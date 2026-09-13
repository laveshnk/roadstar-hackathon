"use client";

import { useMemo, useState } from "react";
import type { DetentionLog, Facility, Load } from "@/lib/types";
import type { SimTruck } from "@/lib/mockData";
import { formatCurrency, formatDuration } from "@/lib/detention";
import { generateDetentionInvoicePDF } from "@/lib/pdf";

export default function DetentionLedger({
  activeLogs, closedLogs, trucks, facilities, loads, invoicedTruckIds, onInvoice,
}: {
  activeLogs: DetentionLog[];
  closedLogs: DetentionLog[];
  trucks: SimTruck[];
  facilities: Facility[];
  loads: Load[];
  invoicedTruckIds: Set<string>;
  onInvoice: (truckId: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "closed" | "invoiced">("all");
  const truckName = (id: string) => trucks.find((t) => t.id === id)?.truck_number ?? id;
  const driverName = (id: string) => trucks.find((t) => t.id === id)?.driver_name ?? "—";
  const facName = (id: string) => facilities.find((f) => f.id === id)?.name ?? id;
  const facCustomer = (id: string) => facilities.find((f) => f.id === id)?.customer ?? "—";
  const loadFor = (id: string) => loads.find((l) => l.id === id);

  const allLogs = useMemo(() => {
    return [...activeLogs, ...closedLogs].sort((a, b) => {
      const aActive = a.status === "ACTIVE" ? 1 : 0;
      const bActive = b.status === "ACTIVE" ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.detention_fee_owed - a.detention_fee_owed;
    });
  }, [activeLogs, closedLogs]);

  const filtered = useMemo(() => {
    if (filter === "active") return allLogs.filter((l) => l.status === "ACTIVE");
    if (filter === "closed") return allLogs.filter((l) => l.status === "CLOSED");
    if (filter === "invoiced") return allLogs.filter((l) => invoicedTruckIds.has(l.truck_id));
    return allLogs;
  }, [allLogs, filter, invoicedTruckIds]);

  const totals = useMemo(() => {
    const unbilled = activeLogs
      .filter((l) => !invoicedTruckIds.has(l.truck_id))
      .reduce((s, l) => s + l.detention_fee_owed, 0);
    const billed = closedLogs.reduce((s, l) => s + l.detention_fee_owed, 0) +
      activeLogs.filter((l) => invoicedTruckIds.has(l.truck_id)).reduce((s, l) => s + l.detention_fee_owed, 0);
    return { unbilled, billed, total: unbilled + billed };
  }, [activeLogs, closedLogs, invoicedTruckIds]);

  const handlePDF = (log: DetentionLog) => {
    const truck = trucks.find((t) => t.id === log.truck_id);
    const facility = facilities.find((f) => f.id === log.facility_id);
    const load = loadFor(log.load_id);
    generateDetentionInvoicePDF({ log, truck, facility, load });
    if (log.status === "ACTIVE") onInvoice(log.truck_id);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Summary cards */}
      <div className="flex shrink-0 gap-3 border-b border-zinc-800 p-4">
        <div className="flex-1 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Unbilled Detention</div>
          <div className="mt-1 font-mono text-lg font-bold text-red-300">{formatCurrency(totals.unbilled)}</div>
        </div>
        <div className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Billed MTD</div>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-300">{formatCurrency(totals.billed)}</div>
        </div>
        <div className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/50 p-3">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Total Revenue</div>
          <div className="mt-1 font-mono text-lg font-bold text-zinc-100">{formatCurrency(totals.total)}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 px-4 py-2">
        {(["all", "active", "closed", "invoiced"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
              filter === f ? "bg-blue-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}>
            {f === "all" ? "All Sessions" : f}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-zinc-500">{filtered.length} sessions</span>
      </div>

      {/* Ledger table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur">
            <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2 font-medium">Session</th>
              <th className="px-4 py-2 font-medium">Truck</th>
              <th className="px-4 py-2 font-medium">Driver</th>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium">Facility</th>
              <th className="px-4 py-2 text-right font-medium">Dock Dur</th>
              <th className="px-4 py-2 text-right font-medium">Billable</th>
              <th className="px-4 py-2 text-right font-medium">Total Owed</th>
              <th className="px-4 py-2 text-center font-medium">Status</th>
              <th className="px-4 py-2 text-center font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log) => {
              const isInvoiced = invoicedTruckIds.has(log.truck_id);
              const isAlert = log.billable_detention_minutes > 0;
              return (
                <tr key={log.id}
                  className={`border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30 ${
                    log.status === "ACTIVE" && isAlert && !isInvoiced ? "bg-red-500/5" : ""
                  }`}>
                  <td className="px-4 py-2 font-mono text-zinc-400">{log.id}</td>
                  <td className="px-4 py-2 font-mono font-semibold text-zinc-200">{truckName(log.truck_id)}</td>
                  <td className="px-4 py-2 text-zinc-300">{driverName(log.truck_id)}</td>
                  <td className="px-4 py-2 text-zinc-400">{facCustomer(log.facility_id)}</td>
                  <td className="px-4 py-2 text-zinc-400">{facName(log.facility_id)}</td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-300">{formatDuration(log.total_dock_minutes)}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    <span className={isAlert ? "text-red-300" : "text-zinc-500"}>{formatDuration(log.billable_detention_minutes)}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-300">{formatCurrency(log.detention_fee_owed)}</td>
                  <td className="px-4 py-2 text-center">
                    {log.status === "ACTIVE" ? (
                      isInvoiced ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">Invoiced</span>
                      ) : isAlert ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-300 ring-1 ring-inset ring-red-500/30">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-red-400" /> Alert
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">Active</span>
                      )
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">Closed</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button type="button" onClick={() => handlePDF(log)}
                      className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-indigo-500">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      {isInvoiced && log.status === "ACTIVE" ? "Re-download PDF" : "Download PDF"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-zinc-500">No detention sessions match this filter.</div>
        )}
      </div>
    </div>
  );
}
