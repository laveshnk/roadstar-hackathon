"use client";

import type { SpotQuoteResult, CandidateStatus } from "@/lib/spotQuote";
import { formatCurrency } from "@/lib/detention";
import { HOS_DRIVE_LIMIT_H } from "@/lib/hos";

const STATUS_META: Record<CandidateStatus, { icon: string; color: string; bg: string; ring: string; label: string }> = {
  OPTIMAL: { icon: "✓", color: "text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30", label: "OPTIMAL" },
  SUBOPTIMAL: { icon: "⚠", color: "text-amber-300", bg: "bg-amber-500/10", ring: "ring-amber-500/30", label: "SUB-OPTIMAL" },
  DISQUALIFIED: { icon: "✕", color: "text-red-300", bg: "bg-red-500/10", ring: "ring-red-500/30", label: "DISQUALIFIED" },
};

export default function SpotQuoteOptimizer({
  result,
  onConfirm,
  onClose,
}: {
  result: SpotQuoteResult;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  const { load, candidates, optimal } = result;

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-gradient-to-r from-indigo-900/40 to-blue-900/40 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">AI Spot-Quote & Pre-Dispatch Optimizer</h2>
              <p className="text-[11px] text-zinc-400">{load.customer} · {load.origin_city} → {load.destination_city} · {load.weight_lbs?.toLocaleString("en-CA")} lbs</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="max-h-[calc(88vh-120px)] overflow-y-auto">
          {/* Driver candidates */}
          <div className="px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Driver Candidate Evaluation</div>
            <div className="space-y-2">
              {candidates.map((c) => {
                const meta = STATUS_META[c.status];
                const isOptimal = c.status === "OPTIMAL";
                return (
                  <div key={c.truck.id} className={`rounded-lg border p-3 ${isOptimal ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/40"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold ${meta.bg} ${meta.color} ring-1 ring-inset ${meta.ring}`}>{meta.icon}</span>
                        <div>
                          <div className="text-xs font-semibold text-zinc-100">{c.driverName} ({c.truckNumber})</div>
                          <div className="text-[10px] text-zinc-500">HOS: {c.hosRemainingH.toFixed(1)}h · Deadhead: {c.deadheadKm.toFixed(0)} km · {c.reeferReady ? "Reefer Ready" : "Dry Van"}</div>
                        </div>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold ${meta.bg} ${meta.color} ring-1 ring-inset ${meta.ring}`}>{meta.label}</span>
                    </div>
                    <p className={`mt-1.5 text-[11px] ${meta.color}`}>{c.reason}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financial breakdown */}
          <div className="border-t border-zinc-800 px-4 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Financial Breakdown</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-zinc-400">Gross Revenue</span><span className="font-mono font-semibold text-emerald-300">{formatCurrency(result.grossRevenue)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Transit ({result.transitKm} km @ $1.15/km)</span><span className="font-mono text-red-300">−{formatCurrency(result.transitCost)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Deadhead Fuel ({result.deadheadKm} km)</span><span className="font-mono text-red-300">−{formatCurrency(result.deadheadCost)}</span></div>
                  <div className="my-1.5 border-t border-zinc-800" />
                  <div className="flex justify-between"><span className="font-semibold text-zinc-200">Projected Net Profit</span><span className="font-mono text-base font-bold text-emerald-300">{formatCurrency(result.netProfit)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Margin</span><span className="font-mono text-emerald-400">{result.marginPct}%</span></div>
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Spot-Quote Win Probability</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-indigo-300">{result.winProbability}%</div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-400" style={{ width: `${result.winProbability}%` }} />
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-zinc-500">Based on margin competitiveness & HOS availability</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/80 px-4 py-3">
          <div className="text-[10px] text-zinc-500">HOS limits: {HOS_DRIVE_LIMIT_H}h drive / 14h on-duty (Cycle 1, South of 60°N)</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">Cancel</button>
            {onConfirm && (
              <button type="button" onClick={onConfirm} disabled={!optimal}
                className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-colors ${optimal ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400" : "cursor-not-allowed bg-zinc-800 text-zinc-500"}`}>
                Confirm & Instant Dispatch
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
