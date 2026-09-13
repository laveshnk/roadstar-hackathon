"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { DetentionLog, Facility, Load } from "@/lib/types";
import type { SimTruck } from "@/lib/mockData";
import { FREE_DETENTION_MINUTES } from "@/lib/config";
import { generateDetentionInvoicePDF } from "@/lib/pdf";
import {
  formatCurrency,
  formatDuration,
  isDetentionAlert,
} from "@/lib/detention";
import { formatHeading, formatKm, formatSpeed, routeLengthKm } from "@/lib/geo";
import StatusBadge from "./StatusBadge";

const TrailerScene3D = dynamic(() => import("./TrailerScene3D"), {
  ssr: false,
  loading: () => <div className="flex h-48 items-center justify-center bg-slate-100 text-xs text-slate-400">Loading 3D view…</div>,
});

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`font-mono text-sm font-semibold ${accent ?? "text-zinc-100"}`}>
        {value}
      </div>
    </div>
  );
}

export default function TrackTracePanel({
  truck,
  facilities,
  loads,
  activeLog,
  invoiced,
  onGenerateInvoice,
  onClose,
}: {
  truck: SimTruck;
  facilities: Facility[];
  loads: Load[];
  activeLog?: DetentionLog;
  invoiced?: boolean;
  onGenerateInvoice?: () => void;
  onClose: () => void;
}) {
  const [show3D, setShow3D] = useState(false);
  const fac = (id: string | null | undefined) =>
    facilities.find((f) => f.id === id);
  const origin = fac(truck.origin_facility_id);
  const dest = fac(truck.destination_facility_id);
  const currentFac = fac(truck.current_facility_id);
  const load = loads.find((l) => l.id === truck.assigned_load_id);

  const alert = activeLog ? isDetentionAlert(activeLog.total_dock_minutes) : false;

  const routePoints = truck.routePoints ?? [];
  const breadcrumb = truck.breadcrumb ?? [];
  const progress = truck.progress ?? 0;
  const remainingPts = routePoints.slice(Math.floor(progress));
  const remainingKm = routeLengthKm(remainingPts);
  const etaMin =
    truck.current_status === "IN_TRANSIT" && truck.speed > 0
      ? (remainingKm / truck.speed) * 60
      : Infinity;

  const lastPoint = breadcrumb[breadcrumb.length - 1];
  const fmtTime = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleTimeString("en-CA", {
          timeZone: "America/Toronto",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "—";

  const progressPct =
    routePoints.length > 1
      ? (progress / (routePoints.length - 1)) * 100
      : 0;

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-[1100] w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/95 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 px-1 text-[11px] font-bold text-white shadow-sm">
            {truck.truck_number}
          </span>
          <div>
            <div className="text-sm font-semibold text-zinc-100">
              Truck {truck.truck_number}
            </div>
            <div className="text-[11px] text-zinc-500">{truck.driver_name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShow3D((s) => !s)}
            title={show3D ? "Hide 3D trailer view" : "View 3D trailer & cargo"}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${show3D ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </button>
          <StatusBadge status={truck.current_status} />
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-3">
        {alert && activeLog && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                DETENTION ALERT
              </span>
              <span className="font-mono text-sm font-bold text-red-200">
                {formatCurrency(activeLog.detention_fee_owed)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-red-200/80">
              Exceeded 2h free dock time by{" "}
              {formatDuration(activeLog.billable_detention_minutes)} · estimated
              unbilled revenue accruing
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Speed"
            value={formatSpeed(truck.speed)}
            accent={truck.current_status === "IN_TRANSIT" ? "text-blue-300" : undefined}
          />
          <Metric label="Odometer" value={formatKm(truck.odometer)} />
          <Metric label="Heading" value={formatHeading(truck.heading)} />
          <Metric
            label="HOS Cycle 1"
            value={
              truck.hos_remaining_hours != null
                ? `${truck.hos_remaining_hours.toFixed(1)}h`
                : "—"
            }
            accent={
              truck.hos_remaining_hours != null
                ? truck.hos_remaining_hours < 8
                  ? "text-red-300"
                  : truck.hos_remaining_hours < 20
                    ? "text-amber-300"
                    : "text-emerald-300"
                : undefined
            }
          />
        </div>

        {/* Route / dock context */}
        {truck.current_status === "IN_TRANSIT" ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Route</span>
              {load && <span className="font-mono text-zinc-400">{load.id}</span>}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-300">
              <span className="truncate">{origin?.name ?? "—"}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 shrink-0 text-zinc-600">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span className="truncate font-medium text-zinc-100">
                {dest?.name ?? "—"}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-400">
              <span>{remainingKm.toFixed(1)} km remaining</span>
              <span>
                ETA{" "}
                <span className="font-medium text-zinc-200">
                  {Number.isFinite(etaMin) ? formatDuration(etaMin) : "—"}
                </span>
              </span>
            </div>
          </div>
        ) : truck.current_status === "DOCKED_WAITING" && currentFac ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Docked at</span>
              {load && <span className="font-mono text-zinc-400">{load.id}</span>}
            </div>
            <div className="mt-1 text-xs font-medium text-zinc-100">
              {currentFac.name}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Metric
                label="Dock time"
                value={activeLog ? formatDuration(activeLog.total_dock_minutes) : "0m"}
                accent={alert ? "text-red-300" : "text-amber-300"}
              />
              <Metric
                label="Billable"
                value={activeLog ? formatDuration(activeLog.billable_detention_minutes) : "0m"}
                accent={alert ? "text-red-300" : undefined}
              />
            </div>
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                <span>Free allowance ({FREE_DETENTION_MINUTES}m)</span>
                {activeLog && (
                  <span className={alert ? "text-red-300" : "text-zinc-400"}>
                    {alert
                      ? `+${formatDuration(activeLog.billable_detention_minutes)} over`
                      : `${formatDuration(FREE_DETENTION_MINUTES - activeLog.total_dock_minutes)} free left`}
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full ${alert ? "bg-red-500" : "bg-amber-400"}`}
                  style={{
                    width: `${Math.min(100, ((activeLog?.total_dock_minutes ?? 0) / FREE_DETENTION_MINUTES) * 100)}%`,
                  }}
                />
              </div>
            </div>
            {alert && activeLog && onGenerateInvoice && (
              <button
                type="button"
                onClick={() => {
                  generateDetentionInvoicePDF({
                    log: activeLog,
                    truck,
                    facility: currentFac,
                    load,
                  });
                  onGenerateInvoice();
                }}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M9 13l2 2 4-4" />
                </svg>
                {invoiced ? "Re-download Invoice PDF" : "Generate Invoice PDF"}
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 text-[11px] text-zinc-400">
            Unit off-duty at {currentFac?.name ?? "yard"}.
          </div>
        )}

        {/* 3D Trailer & Cargo View */}
        {show3D && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/80">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                3D Trailer · {truck.truck_number} · {load?.pallets ?? 0} pallets
              </span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${load?.temp_controlled ? "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"}`}>
                {load?.temp_controlled ? `Reefer ${load.temperature ?? ""}` : "Dry Van"}
              </span>
            </div>
            <div className="h-56 w-full">
              <TrailerScene3D
                pallets={load?.pallets ?? 0}
                isReefer={load?.temp_controlled ?? false}
                truckStatus={truck.current_status}
              />
            </div>
            {/* Load details — exactly what this truck is carrying */}
            {load ? (
              <div className="space-y-1.5 border-t border-slate-200 px-3 py-2 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Active Load</span>
                  <span className="font-mono text-[10px] font-semibold text-slate-600 dark:text-slate-300">{load.id}</span>
                </div>
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{load.customer}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="truncate">{load.origin_city ?? origin?.name ?? "—"}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-2.5 w-2.5 shrink-0"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  <span className="truncate font-medium text-slate-700 dark:text-slate-300">{load.destination_city ?? dest?.name ?? "—"}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {load.weight_lbs?.toLocaleString("en-CA") ?? "—"} lbs
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {load.pallets ?? "—"} pallets
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {load.load_type ?? "Dry Van"}
                  </span>
                  {load.temp_controlled && (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">
                      Reefer · {load.temperature ?? "—"}
                    </span>
                  )}
                </div>
                <p className="truncate text-[10px] text-slate-400 dark:text-slate-500" title={load.commodity}>{load.commodity}</p>
              </div>
            ) : (
              <div className="border-t border-slate-200 px-3 py-2 text-center text-[10px] text-slate-400 dark:border-slate-700 dark:text-slate-500">
                {truck.current_status === "OFF_DUTY" ? "Empty trailer — no active load assigned" : "No load data available"}
              </div>
            )}
          </div>
        )}

        {/* Breadcrumb history */}
        <div>
          <div className="mb-1.5 flex items-center justify-between px-1">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Breadcrumb History
            </h4>
            <span className="text-[10px] text-zinc-500">
              {breadcrumb.length} pts · last {fmtTime(lastPoint?.timestamp)}
            </span>
          </div>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
            {breadcrumb.length > 0 ? (
              breadcrumb
                .slice(-6)
                .reverse()
                .map((p, i, arr) => (
                <div
                  key={`${p.timestamp}-${i}`}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="flex items-center gap-1.5 text-zinc-400">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        i === 0
                          ? "bg-blue-400"
                          : i === arr.length - 1
                            ? "bg-zinc-600"
                            : "bg-zinc-500"
                      }`}
                    />
                    {fmtTime(p.timestamp)}
                  </span>
                  <span className="font-mono text-zinc-500">
                    {formatSpeed(p.speed)} · {formatKm(p.odometer)}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-2 text-center text-[10px] text-zinc-600">No breadcrumb history yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
