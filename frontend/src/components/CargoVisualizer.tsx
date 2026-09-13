"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { AXLE_LIMITS, calculateAxleDistributionWithEquipment, getDriverEquipment } from "@/lib/axleWeight";

// Dynamic import the 3D scene with ssr: false to avoid hydration errors.
const TrailerScene3D = dynamic(() => import("./TrailerScene3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs text-slate-400">
      Loading 3D scene…
    </div>
  ),
});

import TopDownFloorPlan from "./TopDownFloorPlan";
import SideCutaway from "./SideCutaway";

type ViewMode = "iso" | "top" | "side";

interface CargoVisualizerProps {
  pallets: number;
  weightLbs: number;
  isReefer: boolean;
  /** Selected truck ID for driver-specific axle evaluation. */
  selectedTruckId?: string | null;
}

function AxleBar({ label, value, limit, pct, over }: { label: string; value: number; limit: number; pct: number; over: boolean }) {
  const color = over ? "bg-rose-500" : pct > 85 ? "bg-amber-500" : "bg-emerald-500";
  const textColor = over ? "text-rose-600" : pct > 85 ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[10px] font-medium text-slate-600">{label}</span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-slate-700">
          {value.toLocaleString()} / {limit.toLocaleString()} lbs
        </span>
      </div>
      <span className={`w-10 shrink-0 text-right text-[10px] font-bold ${textColor}`}>{Math.round(pct)}%</span>
    </div>
  );
}

export default function CargoVisualizer({ pallets, weightLbs, isReefer, selectedTruckId = null }: CargoVisualizerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("iso");
  const equip = useMemo(() => getDriverEquipment(selectedTruckId), [selectedTruckId]);
  const axle = useMemo(() => calculateAxleDistributionWithEquipment(weightLbs, equip), [weightLbs, equip]);
  const capacity = 26;
  const utilizationPct = Math.round((pallets / capacity) * 100);

  return (
    <div className="space-y-3">
      {/* View toggle + Capacity badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
          {([["iso", "Isometric 3D"], ["top", "Top-Down"], ["side", "Side Cutaway"]] as const).map(([mode, label]) => (
            <button key={mode} type="button" onClick={() => setViewMode(mode)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${viewMode === mode ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${utilizationPct >= 100 ? "bg-rose-100 text-rose-700 ring-rose-200" : "bg-emerald-100 text-emerald-700 ring-emerald-200"}`}>
            Pallet Utilization: {pallets} / {capacity} ({utilizationPct}%)
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${axle.payloadOver ? "bg-rose-100 text-rose-700 ring-rose-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>
            Payload: {weightLbs.toLocaleString()} / {AXLE_LIMITS.payload.toLocaleString()} lbs
          </span>
        </div>
      </div>

      {/* 3D / 2D viewport */}
      <div className="relative h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {viewMode === "iso" && <TrailerScene3D pallets={pallets} isReefer={isReefer} />}
        {viewMode === "top" && <TopDownFloorPlan pallets={pallets} isReefer={isReefer} />}
        {viewMode === "side" && <SideCutaway pallets={pallets} isReefer={isReefer} />}

        {/* 3D HUD overlay banner — axle compliance status */}
        {selectedTruckId && (
          <div className={`pointer-events-none absolute left-3 top-3 z-10 rounded-lg px-3 py-1.5 text-[10px] font-bold shadow-lg backdrop-blur ${axle.compliant ? "bg-emerald-500/90 text-white" : "bg-rose-500/90 text-white"}`}>
            {axle.compliant
              ? `✅ COMPLIANT: GVW ${axle.gross.toLocaleString()} lbs | Legal Axle Clearance`
              : `⚠️ ${axle.warning?.replace("⚠️ ", "") ?? "AXLE OVERLOAD"}`
            }
          </div>
        )}
        {/* Driver equipment badge */}
        {selectedTruckId && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-lg bg-slate-900/80 px-2.5 py-1 text-[9px] font-semibold text-slate-100 shadow-lg backdrop-blur">
            {equip.driverName} · {equip.trailerType.replace("_", " ")}
            {equip.residualPayloadLbs > 0 && <span className="ml-1 text-amber-300">⚠ Residual: {equip.residualPayloadLbs.toLocaleString()} lbs</span>}
          </div>
        )}
      </div>

      {/* Axle weight distribution */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Axle Weight Distribution (Ontario MTO) {selectedTruckId && `· ${equip.driverName}`}
        </div>
        <AxleBar label="Steer Axle" value={axle.steer} limit={equip.maxSteerAxleLbs} pct={axle.steerPct} over={axle.steerOver} />
        <AxleBar label="Drive Tandem" value={axle.driveTandem} limit={equip.maxDriveAxleLbs} pct={axle.drivePct} over={axle.driveOver} />
        <AxleBar label="Trailer Tandem" value={axle.trailerTandem} limit={equip.maxTrailerAxleLbs} pct={axle.trailerPct} over={axle.trailerOver} />
        <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
          <span>Tare: ~{(equip.tractorTareLbs + equip.trailerTareLbs).toLocaleString()} lbs</span>
          <span>Gross: <span className={`font-bold ${axle.grossOver ? "text-rose-600" : "text-slate-700"}`}>{axle.gross.toLocaleString()} lbs</span></span>
        </div>
      </div>

      {/* Overweight warning or compliant banner */}
      {axle.warning ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mt-0.5 h-3.5 w-3.5 shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          {axle.warning}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
          ✅ COMPLIANT: Gross {axle.gross.toLocaleString()} lbs within legal {AXLE_LIMITS.gross.toLocaleString()} lbs MTO limit
        </div>
      )}
    </div>
  );
}
