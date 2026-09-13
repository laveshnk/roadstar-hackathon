"use client";

import { useState } from "react";
import type { DetentionLog, Facility, Load } from "@/lib/types";
import type { SimTruck } from "@/lib/mockData";
import { FREE_DETENTION_MINUTES, DETENTION_RATE_PER_HOUR } from "@/lib/config";
import { formatDuration, formatCurrency } from "@/lib/detention";
import { HOS_DRIVE_LIMIT_H, HOS_ON_DUTY_LIMIT_H, HOS_CYCLE_LIMIT_H } from "@/lib/hos";

type ELDDutyStatus = "DRIVING" | "ON_DUTY" | "SLEEPER" | "OFF_DUTY";

/** Circular gauge component for HOS countdowns. */
function HOSGauge({
  label, used, limit, unit, color,
}: {
  label: string; used: number; limit: number; unit: string; color: string;
}) {
  const pct = Math.min(100, (used / limit) * 100);
  const remaining = Math.max(0, limit - used);
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-20 w-20">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgb(39 39 42)" strokeWidth="6" />
          <circle cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round"
            className="transition-all duration-500" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-sm font-bold text-zinc-100">{remaining.toFixed(1)}</span>
          <span className="text-[8px] text-zinc-500">{unit} left</span>
        </div>
      </div>
      <span className="mt-1 text-[9px] font-medium text-zinc-400">{label}</span>
      <span className="text-[8px] text-zinc-600">{used.toFixed(1)} / {limit}{unit}</span>
    </div>
  );
}

export default function DriverPortal({
  trucks, facilities, loads, activeDetentionLogs, selectedTruckId, onSelectTruck, onReportDelay,
}: {
  trucks: SimTruck[];
  facilities: Facility[];
  loads: Load[];
  activeDetentionLogs: DetentionLog[];
  selectedTruckId: string | null;
  onSelectTruck: (id: string) => void;
  onReportDelay?: (truckId: string) => void;
}) {
  const [dutyStatus, setDutyStatus] = useState<ELDDutyStatus>("DRIVING");
  const [arrivedAtDock, setArrivedAtDock] = useState(false);
  const [loadAccepted, setLoadAccepted] = useState(true);
  const [delayReported, setDelayReported] = useState(false);

  const truck = trucks.find((t) => t.id === selectedTruckId) ?? trucks[0];
  const load = loads.find((l) => l.id === truck?.assigned_load_id);
  const activeLog = activeDetentionLogs.find((l) => l.truck_id === truck?.id);
  const facility = facilities.find((f) => f.id === truck?.current_facility_id);

  if (!truck) return null;

  const cycleRemaining = truck.hos_remaining_hours ?? 0;
  const driveUsed = HOS_DRIVE_LIMIT_H - Math.min(cycleRemaining, HOS_DRIVE_LIMIT_H);
  const dutyUsed = HOS_ON_DUTY_LIMIT_H - Math.min(cycleRemaining, HOS_ON_DUTY_LIMIT_H);
  const cycleUsed = HOS_CYCLE_LIMIT_H - cycleRemaining;

  const dockMinutes = activeLog?.total_dock_minutes ?? 0;
  const isDetentionActive = arrivedAtDock && dockMinutes > FREE_DETENTION_MINUTES;
  const freeRemaining = Math.max(0, FREE_DETENTION_MINUTES - dockMinutes);
  const ratePerMin = DETENTION_RATE_PER_HOUR / 60;

  const dutyButtons: { status: ELDDutyStatus; label: string; color: string }[] = [
    { status: "DRIVING", label: "Driving", color: "bg-blue-600" },
    { status: "ON_DUTY", label: "On-Duty", color: "bg-amber-600" },
    { status: "SLEEPER", label: "Sleeper", color: "bg-indigo-600" },
    { status: "OFF_DUTY", label: "Off-Duty", color: "bg-zinc-600" },
  ];

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-zinc-950 p-4">
      {/* Phone frame */}
      <div className="relative h-[760px] w-[380px] shrink-0 overflow-hidden rounded-[2.5rem] border-[10px] border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60">
        {/* Notch */}
        <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-zinc-800" />
        {/* Status bar */}
        <div className="flex items-center justify-between px-6 pb-1 pt-2 text-[10px] font-medium text-zinc-400">
          <span>{new Date().toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          <span className="flex items-center gap-1">
            <span className="ml-1 rounded bg-emerald-500/20 px-1 text-emerald-300">100%</span>
          </span>
        </div>

        {/* App header */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 px-1 text-[11px] font-bold text-white">
            {truck.truck_number}
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold text-zinc-100">ELD Driver Portal</div>
            <div className="text-[9px] text-zinc-500">{truck.driver_name} · Truck {truck.truck_number}</div>
          </div>
          <select value={truck.id} onChange={(e) => onSelectTruck(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 focus:outline-none">
            {trucks.map((t) => (
              <option key={t.id} value={t.id}>{t.driver_name}</option>
            ))}
          </select>
        </div>

        {/* Scrollable content */}
        <div className="h-[calc(100%-88px)] space-y-3 overflow-y-auto p-3">
          {/* ELD Duty Status Switcher */}
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Duty Status (ELD)</div>
            <div className="grid grid-cols-4 gap-1.5">
              {dutyButtons.map((b) => (
                <button key={b.status} type="button" onClick={() => setDutyStatus(b.status)}
                  className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[9px] font-semibold transition-all ${
                    dutyStatus === b.status ? `${b.color} text-white shadow-lg` : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}>
                  <span className={`h-2 w-2 rounded-full ${dutyStatus === b.status ? "bg-white" : "bg-zinc-500"}`} />
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* HOS Gauges */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Canadian HOS Gauges</div>
            <div className="flex items-center justify-around">
              <HOSGauge label="Drive Time" used={driveUsed} limit={HOS_DRIVE_LIMIT_H} unit="h" color="#3b82f6" />
              <HOSGauge label="Shift Window" used={dutyUsed} limit={HOS_ON_DUTY_LIMIT_H} unit="h" color="#f59e0b" />
              <HOSGauge label="Cycle 1" used={cycleUsed} limit={HOS_CYCLE_LIMIT_H} unit="h" color={cycleRemaining < 8 ? "#ef4444" : "#10b981"} />
            </div>
          </div>

          {/* Incoming Load Card */}
          {load ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Incoming Load</span>
                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-medium text-blue-300 ring-1 ring-inset ring-blue-500/30">{load.status}</span>
              </div>
              <div className="text-xs font-semibold text-zinc-100">{load.customer}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-400">
                <span>{load.origin_city}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-2.5 w-2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                <span className="font-medium text-zinc-300">{load.destination_city}</span>
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">{load.commodity} · {load.weight_lbs?.toLocaleString("en-CA")} lbs · {load.pallets} pal</div>
              {load.temp_controlled && (
                <div className="mt-1 inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-medium text-sky-300">Reefer · {load.temperature}</div>
              )}
              {loadAccepted ? (
                <div className="mt-2 flex gap-1.5">
                  <button type="button" disabled className="flex-1 rounded-lg bg-emerald-500/15 py-1.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">✓ Load Accepted</button>
                  <button type="button" onClick={() => setLoadAccepted(false)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[10px] font-medium text-zinc-400 hover:bg-zinc-800">Reject</button>
                </div>
              ) : (
                <button type="button" onClick={() => setLoadAccepted(true)} className="mt-2 w-full rounded-lg bg-blue-600 py-1.5 text-[10px] font-semibold text-white hover:bg-blue-500">Accept Load</button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center text-[10px] text-zinc-500">No active load assigned.</div>
          )}

          {/* Real-Time Dock Clock */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Dock Clock</div>
            {!arrivedAtDock ? (
              <button type="button" onClick={() => setArrivedAtDock(true)}
                className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 py-2 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20">
                Mark Arrived at Facility
              </button>
            ) : (
              <div className="flex flex-col items-center">
                <div className="relative h-24 w-24">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgb(39 39 42)" strokeWidth="6" />
                    <circle cx="50" cy="50" r="42" fill="none"
                      stroke={isDetentionActive ? "#ef4444" : "#f59e0b"} strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 42}
                      strokeDashoffset={2 * Math.PI * 42 * (1 - Math.min(100, (dockMinutes / FREE_DETENTION_MINUTES) * 100) / 100)}
                      className={`transition-all duration-500 ${isDetentionActive ? "animate-pulse" : ""}`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`font-mono text-sm font-bold ${isDetentionActive ? "text-red-300" : "text-amber-300"}`}>{formatDuration(dockMinutes)}</span>
                    <span className="text-[8px] text-zinc-500">docked</span>
                  </div>
                </div>
                {isDetentionActive ? (
                  <div className="mt-2 animate-pulse rounded-lg bg-red-500/15 px-3 py-1.5 text-center text-[9px] font-bold text-red-300 ring-1 ring-inset ring-red-500/30">
                    DETENTION BILLING ACTIVE<br />{formatCurrency(dockMinutes * ratePerMin)} accruing<br />
                    <span className="text-[8px] font-normal">${(DETENTION_RATE_PER_HOUR / 60).toFixed(2)}/min</span>
                  </div>
                ) : (
                  <div className="mt-2 text-center text-[10px] text-zinc-400">{formatDuration(freeRemaining)} free remaining</div>
                )}
                <div className="mt-1 text-[9px] text-zinc-600">{facility?.name ?? "Facility"}</div>
              </div>
            )}
          </div>

          {/* Traffic Jam Override */}
          <button type="button" onClick={() => { setDelayReported(true); onReportDelay?.(truck.id); }} disabled={delayReported}
            className={`w-full rounded-xl py-2.5 text-[11px] font-semibold transition-colors ${
              delayReported ? "cursor-default bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30" : "border border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
            }`}>
            {delayReported ? "✓ 401 Delay Reported to Dispatch" : "Report 401 Delay"}
          </button>
        </div>
      </div>
    </div>
  );
}
