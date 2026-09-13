/**
 * Apex Corridor Systems Driver ELD — Main App Component (v2.0).
 * Clean, distraction-free mobile ELD with driver switching.
 */

import { useEffect, useState } from "react";
import { useDriverStore, FLEET_ROSTER, driveRemainingHours, onDutyRemainingHours, cycleRemainingHours, dockDwellMinutes, isDetentionActive, nextDispatchAction } from "./store.ts";
import { fleetSync } from "./sync.ts";
import { HOS_DRIVE_LIMIT_H, HOS_ON_DUTY_LIMIT_H, HOS_CYCLE_LIMIT_H, FREE_DETENTION_MINUTES, DETENTION_RATE_PER_HOUR } from "./types.ts";
import type { DutyStatus } from "./types.ts";

const DUTY_BUTTONS: { status: DutyStatus; label: string; color: string }[] = [
  { status: "DRIVING", label: "Driving", color: "bg-blue-600" },
  { status: "ON_DUTY", label: "On-Duty", color: "bg-amber-600" },
  { status: "SLEEPER", label: "Sleeper", color: "bg-indigo-600" },
  { status: "OFF_DUTY", label: "Off-Duty", color: "bg-slate-600" },
];

function fmtDur(m: number): string { const h = Math.floor(m / 60); const mm = Math.round(m % 60); return h <= 0 ? `${mm}m` : `${h}h ${String(mm).padStart(2,"0")}m`; }
function fmtCur(a: number): string { return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a); }
function hspill(remH: number): string {
  if (remH < 1) return "bg-red-500/20 text-red-300 ring-red-500/40 animate-pulse";
  if (remH < 2) return "bg-amber-500/20 text-amber-300 ring-amber-500/40";
  return "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40";
}

/** Play a two-tone alert chime (587Hz -> 880Hz) for incoming offers. */
function playChime(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    for (const [freq, delay] of [[587, 0], [880, 0.15]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.3, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.5);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + delay);
      osc.stop(now + delay + 0.5);
    }
  } catch { /* noop */ }
}

export default function App() {
  const state = useDriverStore();
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showDeclineReason, setShowDeclineReason] = useState(false);

  useEffect(() => {
    const id = setInterval(() => { setNow(Date.now()); state.tick(1); }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fleetSync.connect();
    return fleetSync.onConnectionChange(setConnected);
  }, []);

  // Listen for incoming DISPATCH_OFFER events from the dispatcher dashboard.
  useEffect(() => {
    return fleetSync.onMessage((offer) => {
      // Only process offers for the currently active driver's truck.
      if (offer.truckId === state.driver.truckId) {
        playChime();
        state.receiveOffer(offer);
      }
    });
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const driveRemH = driveRemainingHours(state);
  const onDutyRemH = onDutyRemainingHours(state);
  const cycleRemH = cycleRemainingHours(state);
  const dwellMin = dockDwellMinutes(state, now);
  const detentionActive = isDetentionActive(state, now);
  const freeRemaining = Math.max(0, FREE_DETENTION_MINUTES - dwellMin);
  const actionLabel = nextDispatchAction(state.dispatchStage);
  const isCompleted = state.dispatchStage === "COMPLETED";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-950 text-slate-100 shadow-2xl">
      {/* === Compact Header === */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
            <svg viewBox="0 0 64 64" fill="none" className="h-4 w-4"><path d="M8 48 L24 16 H40 L56 48" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="48" r="4" fill="#059669" /><circle cx="32" cy="16" r="4" fill="white" /><circle cx="52" cy="48" r="4" fill="#e11d48" /></svg>
          </div>
          <span className="text-xs font-bold text-slate-100">Apex Corridor Systems</span>
        </div>
        <select value={state.driver.driverId} onChange={(e) => { const fd = FLEET_ROSTER.find((d) => d.driverId === e.target.value); if (fd) state.switchDriver(fd); }}
          className="min-w-[7rem] rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 focus:border-blue-500 focus:outline-none">
          {FLEET_ROSTER.map((d) => (<option key={d.driverId} value={d.driverId}>{d.driverName} / {d.truckNumber} · {d.hosRemainingHours.toFixed(1)}h</option>))}
        </select>
        <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-slate-600"}`} /></span>
      </div>

      {/* === Incoming Dispatch Offer Modal === */}
      {state.incomingOffer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-blue-500/40 bg-slate-900 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-800 bg-blue-500/10 px-4 py-3">
              <span className="flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-blue-500 text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>
              </span>
              <div>
                <div className="text-xs font-bold text-blue-300">Incoming Dispatch Offer</div>
                <div className="text-[10px] text-slate-500">{state.incomingOffer.loadId}</div>
              </div>
            </div>
            <div className="space-y-2.5 p-4">
              <div className="text-sm font-bold text-slate-100">{state.incomingOffer.customer}</div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="rounded bg-slate-800 px-2 py-0.5 font-medium">{state.incomingOffer.origin}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 text-slate-500"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-medium">{state.incomingOffer.destination}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg bg-slate-800/50 p-2"><div className="text-slate-500">Deadhead</div><div className="font-bold text-slate-200">{state.incomingOffer.deadheadKm} km</div></div>
                <div className="rounded-lg bg-slate-800/50 p-2"><div className="text-slate-500">Cargo Weight</div><div className="font-bold text-slate-200">{state.incomingOffer.weightLbs.toLocaleString()} lbs</div></div>
                <div className="rounded-lg bg-slate-800/50 p-2"><div className="text-slate-500">Pallets</div><div className="font-bold text-slate-200">{state.incomingOffer.pallets}</div></div>
                <div className="rounded-lg bg-emerald-500/10 p-2"><div className="text-emerald-400">Rate</div><div className="font-bold text-emerald-300">{fmtCur(state.incomingOffer.payout)}</div></div>
              </div>
              {state.incomingOffer.tempControlled && (
                <div className="flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
                  Reefer · {state.incomingOffer.temperature}
                </div>
              )}
              {!showDeclineReason ? (
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => state.acceptOffer()} className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg transition-all hover:bg-emerald-500">
                    ✓ Accept Load
                  </button>
                  <button type="button" onClick={() => setShowDeclineReason(true)} className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-bold text-red-300 transition-all hover:bg-red-500/20">
                    ✗ Decline Load
                  </button>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <div className="text-[10px] font-semibold uppercase text-slate-500">Select Decline Reason</div>
                  {["HOS Rest Required", "Mechanical Delay", "Truck At Capacity", "Other"].map((r) => (
                    <button key={r} type="button" onClick={() => { state.declineOffer(r); setShowDeclineReason(false); }} className="flex w-full items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2.5 text-xs font-medium text-slate-400 transition-all hover:bg-red-500/10 hover:text-red-300">
                      {r}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 opacity-50"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  ))}
                  <button type="button" onClick={() => setShowDeclineReason(false)} className="w-full text-center text-[10px] text-slate-500 hover:text-slate-400">← Back</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === Scrollable Content === */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span>{state.driver.driverName} · Truck {state.driver.truckNumber}</span>
          <span>{new Date(now).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
        </div>

        {/* === Duty Status (Large Buttons) === */}
        <section>
          <div className="grid grid-cols-4 gap-1.5">
            {DUTY_BUTTONS.map((b) => (
              <button key={b.status} type="button" onClick={() => state.setDutyStatus(b.status)}
                className={`flex flex-col items-center gap-1 rounded-xl py-3 text-[10px] font-bold transition-all ${state.dutyStatus === b.status ? `${b.color} text-white shadow-lg` : "bg-slate-800 text-slate-400"}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${state.dutyStatus === b.status ? "bg-white" : "bg-slate-600"}`} />{b.label}
              </button>
            ))}
          </div>
        </section>

        {/* === HOS Metric Pills === */}
        <section className="grid grid-cols-3 gap-2">
          <div className={`rounded-lg px-2 py-1.5 text-center ring-1 ring-inset ${hspill(driveRemH)}`}><div className="text-[8px] font-semibold uppercase opacity-70">Drive</div><div className="font-mono text-sm font-bold">{driveRemH.toFixed(1)}h</div><div className="text-[7px] opacity-60">/ {HOS_DRIVE_LIMIT_H}h max</div></div>
          <div className={`rounded-lg px-2 py-1.5 text-center ring-1 ring-inset ${hspill(onDutyRemH)}`}><div className="text-[8px] font-semibold uppercase opacity-70">Shift</div><div className="font-mono text-sm font-bold">{onDutyRemH.toFixed(1)}h</div><div className="text-[7px] opacity-60">/ {HOS_ON_DUTY_LIMIT_H}h max</div></div>
          <div className={`rounded-lg px-2 py-1.5 text-center ring-1 ring-inset ${hspill(cycleRemH)}`}><div className="text-[8px] font-semibold uppercase opacity-70">Cycle</div><div className="font-mono text-sm font-bold">{cycleRemH.toFixed(1)}h</div><div className="text-[7px] opacity-60">/ {HOS_CYCLE_LIMIT_H}h max</div></div>
        </section>

        {/* === Load Offer === */}
        {state.loadOffered && state.dispatchStage === "PENDING" && (
          <section className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">Incoming Load Offer</div>
            <div className="mt-1 text-xs font-bold text-slate-100">{state.load.customer}</div>
            <div className="mt-0.5 text-[10px] text-slate-400">{state.load.originCity} → {state.load.destinationCity} · {state.load.weightLbs.toLocaleString()} lbs · {state.load.cargoType}</div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => state.acceptLoad()} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-[11px] font-bold text-white hover:bg-emerald-500">✓ Accept</button>
              <button type="button" onClick={() => state.declineLoad()} className="flex-1 rounded-lg bg-slate-700 py-2.5 text-[11px] font-bold text-slate-300 hover:bg-slate-600">✕ Decline</button>
            </div>
          </section>
        )}

        {/* === Active Task === */}
        {!state.loadOffered && !isCompleted && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Active Load</span><span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-medium text-blue-300">{state.load.orderId}</span></div>
            <div className="mt-1 text-xs font-bold text-slate-100">{state.load.customer}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400"><span>{state.load.originCity}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-2.5 w-2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg><span className="font-medium text-slate-300">{state.load.destinationCity}</span></div>
            <button type="button" onClick={() => state.advanceDispatch()} className="mt-2.5 w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-bold text-white hover:from-blue-500 hover:to-indigo-500">{actionLabel}</button>
          </section>
        )}

        {/* === Dock Timer === */}
        {state.dockArrivalTime && (
          <section className={`rounded-xl border p-3 ${detentionActive ? "border-red-500/50 bg-red-950/40" : "border-amber-500/40 bg-amber-950/20"}`}>
            <div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Dock Timer</span><span className="text-[9px] text-slate-500">{new Date(state.dockArrivalTime).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}</span></div>
            {detentionActive ? (
              <div className="mt-1 animate-pulse text-center"><div className="text-xs font-bold text-red-300">⚠ DETENTION BILLING ACTIVE</div><div className="mt-1 font-mono text-xl font-bold text-red-400">{fmtCur(dwellMin * (DETENTION_RATE_PER_HOUR / 60))}</div><div className="text-[10px] text-red-400">{fmtCur(DETENTION_RATE_PER_HOUR)}/hr (${(DETENTION_RATE_PER_HOUR / 60).toFixed(2)}/min)</div><div className="mt-1 text-[10px] text-red-500">Dwell: {fmtDur(dwellMin)} ({fmtDur(dwellMin - FREE_DETENTION_MINUTES)} billable)</div></div>
            ) : (
              <div className="mt-1 text-center"><div className="text-[10px] text-amber-400">Free Time Remaining</div><div className="mt-1 font-mono text-2xl font-bold text-amber-300">{fmtDur(freeRemaining)}</div><div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-amber-400 transition-all duration-1000" style={{ width: `${Math.min(100, (dwellMin / FREE_DETENTION_MINUTES) * 100)}%` }} /></div></div>
            )}
          </section>
        )}

        {/* === Completed === */}
        {isCompleted && (<section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-center"><div className="text-xs font-bold text-emerald-300">✓ Delivery Complete — POD Submitted</div></section>)}

        {/* === Emergency Quick Actions === */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <button type="button" onClick={() => setShowActions((s) => !s)} className="flex w-full items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Emergency Quick Actions</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showActions ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {showActions && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => state.reportTrafficDelay()} className="flex items-center justify-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 py-2.5 text-[10px] font-bold text-orange-300 hover:bg-orange-500/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>Report 401 Delay</button>
              <button type="button" onClick={() => state.requestEmergencyRest()} className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 py-2.5 text-[10px] font-bold text-red-300 hover:bg-red-500/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>Log Rest Break</button>
            </div>
          )}
          {state.delayTags.length > 0 && (<div className="mt-2 space-y-1">{state.delayTags.map((tag) => (<div key={tag.id} className="flex items-center justify-between rounded-lg bg-orange-500/5 px-2 py-1 text-[9px] text-orange-300"><span>🚧 {tag.label}</span><span>+{tag.minutes} min</span></div>))}</div>)}
        </section>

        {/* === Notifications === */}
        {state.notifications.length > 0 && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-1.5 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Notifications</span><button type="button" onClick={() => state.clearNotifications()} className="text-[9px] text-slate-600 hover:text-slate-400">Clear</button></div>
            <div className="space-y-1">{state.notifications.slice(-5).map((msg, i) => (<div key={i} className="rounded-lg bg-slate-800/50 px-2 py-1 text-[10px] text-slate-400">{msg}</div>))}</div>
          </section>
        )}
      </div>

      {/* === Footer === */}
      <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-[9px] text-slate-600"><span>Apex Corridor Systems · Driver ELD v2.0</span><button type="button" onClick={() => state.resetAll()} className="text-slate-600 hover:text-slate-400">Reset ELD</button></div>
    </div>
  );
}
