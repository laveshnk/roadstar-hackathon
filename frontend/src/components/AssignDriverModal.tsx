"use client";

import { useMemo, useState } from "react";
import type { Facility, Load } from "@/lib/types";
import type { SimTruck } from "@/lib/mockData";
import { auditHOS, findBackhauls, HOS_DRIVE_LIMIT_H, HOS_ON_DUTY_LIMIT_H } from "@/lib/hos";
import CargoVisualizer from "./CargoVisualizer";
import { emitTutorialAction } from "./AICoPilot";

export default function AssignDriverModal({
  load, trucks, facilities, loads, onConfirm, onClose,
}: {
  load: Load; trucks: SimTruck[]; facilities: Facility[]; loads: Load[];
  onConfirm: (truckId: string) => void; onClose: () => void;
}) {
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<"audit" | "cargo">("audit");

  const audits = useMemo(() => {
    // Show ALL unassigned trucks — including OFF_DUTY drivers with available
    // HOS cycle hours. Off-duty drivers with remaining cycle hours are
    // prioritized at the top of the list (they have the freshest hours).
    const candidates = trucks.filter((t) => !t.assigned_load_id);
    return candidates
      .map((t) => auditHOS(t, load, facilities))
      .sort((a, b) => {
        // 1. Compliant drivers first.
        if (a.compliant !== b.compliant) return a.compliant ? -1 : 1;
        // 2. Off-duty with HOS > 0 prioritized (freshest cycle hours).
        const aOffDuty = a.truck.current_status === "OFF_DUTY";
        const bOffDuty = b.truck.current_status === "OFF_DUTY";
        const aHos = a.truck.hos_remaining_hours ?? 0;
        const bHos = b.truck.hos_remaining_hours ?? 0;
        if (aOffDuty && aHos > 0 && !(bOffDuty && bHos > 0)) return -1;
        if (bOffDuty && bHos > 0 && !(aOffDuty && aHos > 0)) return 1;
        // 3. Most HOS remaining first.
        return bHos - aHos;
      });
  }, [trucks, load, facilities]);

  const selectedAudit = audits.find((a) => a.truck.id === selectedTruckId);

  // Backhaul suggester: find return loads within 40km of the load's destination.
  const destFac = facilities.find((f) => f.id === load.destination_facility_id);
  const backhauls = useMemo(() => {
    if (!destFac) return [];
    return findBackhauls(destFac, loads, facilities, 40);
  }, [destFac, loads, facilities]);


  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Pre-Dispatch Audit</h2>
            <p className="text-[11px] text-slate-400">Load {load.id} · {load.customer}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Load summary */}
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>{load.origin_city ?? "Origin"}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 text-slate-400">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <span className="font-medium text-slate-700">{load.destination_city ?? "Destination"}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {load.temp_controlled ? (
              <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                Reefer · {load.temperature ?? "Climate"}
              </span>
            ) : (
              <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                {load.load_type ?? "Dry Van"} · Ambient
              </span>
            )}
            {load.weight_lbs != null && (
              <span className="text-[10px] text-slate-500">{load.weight_lbs.toLocaleString("en-CA")} lbs</span>
            )}
          </div>

          {/* Modal tab switcher */}
          <div className="mt-2.5 flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
            <button type="button" onClick={() => setModalTab("audit")}
              className={`flex-1 rounded-md px-3 py-1.5 text-[10px] font-bold transition-colors ${modalTab === "audit" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              Driver Audit
            </button>
            <button type="button" onClick={() => { setModalTab("cargo"); emitTutorialAction("VIEW_3D_FIT"); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-[10px] font-bold transition-colors ${modalTab === "cargo" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              3D Cargo Fit & Axles
            </button>
          </div>
        </div>

        {/* Driver list — only shown in audit tab */}
        {modalTab === "audit" && (
        <div className="mx-4 my-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 pr-2">
          {audits.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-slate-500">
              No available drivers (all trucks are already assigned).
            </p>
          ) : (
            audits.map((a) => {
              const selected = a.truck.id === selectedTruckId;
              const isOffDuty = a.truck.current_status === "OFF_DUTY";
              return (
                <button
                  key={a.truck.id}
                  type="button"
                  onClick={() => {
                    setSelectedTruckId(a.truck.id);
                    if (a.compliant) {
                      emitTutorialAction("DRIVER_SELECTED");
                      emitTutorialAction("AXLE_CLEARED");
                    }
                  }}
                  className={`mb-1 w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    selected
                      ? "border-blue-600 bg-blue-50 text-slate-900 ring-2 ring-blue-500"
                      : a.compliant
                        ? "border-slate-200 bg-white hover:bg-slate-50"
                        : "border-red-200 bg-red-50 hover:bg-red-100"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-bold ring-1 ring-inset ${selected ? "bg-blue-100 text-blue-700 ring-blue-300" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                        {a.truck.truck_number}
                      </span>
                      <div>
                        <div className={`text-xs font-semibold ${selected ? "text-slate-900" : "text-slate-800"}`}>
                          {a.truck.driver_name}
                          {isOffDuty && (
                            <span className="ml-1.5 inline-flex items-center rounded bg-indigo-100 px-1 py-0.5 text-[8px] font-bold text-indigo-700 ring-1 ring-inset ring-indigo-200">OFF-DUTY</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          HOS: {(a.truck.hos_remaining_hours ?? 0).toFixed(1)}h remaining · {a.truck.current_status.replace("_", " ")}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] text-slate-500">
                        Route: {a.routeHours.toFixed(1)}h · {a.routeKm.toFixed(0)}km
                      </span>
                      {a.violation && (
                        <span className="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                          COMPLIANCE VIOLATION
                        </span>
                      )}
                      {a.equipmentMismatch && (
                        <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                          EQUIPMENT MISMATCH
                        </span>
                      )}
                      {a.compliant && (
                        <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          COMPLIANT
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
        )}

        {/* 3D Cargo Fit & Axles tab */}
        {modalTab === "cargo" && (
          <div className="max-h-72 overflow-y-auto px-4 py-3">
            <CargoVisualizer
              pallets={load.pallets ?? 0}
              weightLbs={load.weight_lbs ?? 0}
              isReefer={load.temp_controlled ?? false}
              selectedTruckId={selectedTruckId}
            />
          </div>
        )}

        {/* Warning panel for selected driver */}
        {selectedAudit && !selectedAudit.compliant && (
          <div className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5">
            {selectedAudit.violation && (
              <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mt-0.5 h-3 w-3 shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                {selectedAudit.violation}
              </p>
            )}
            {selectedAudit.equipmentMismatch && (
              <p className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mt-0.5 h-3 w-3 shrink-0">
                  <path d="M12 2v20M5 9l7-7 7 7" />
                </svg>
                {selectedAudit.equipmentMismatch}
              </p>
            )}
          </div>
        )}

        {/* Backhaul Suggester */}
        {backhauls.length > 0 && (
          <div className="mx-4 mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
                <path d="M3 12l4-4v3h10V8l4 4-4 4v-3H7v3z" />
              </svg>
              Backhaul Suggester · {backhauls.length} return load{backhauls.length > 1 ? "s" : ""} within 40km
            </div>
            {backhauls.slice(0, 3).map((bh) => (
              <div key={bh.id} className="mt-1 flex items-center justify-between text-[10px] text-slate-600">
                <span className="truncate">{bh.origin_city} → {bh.destination_city}</span>
                <span className="shrink-0 text-indigo-700">{bh.customer.slice(0, 20)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pinned Footer — locked to bottom so it's always visible */}
        <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
          <div className="text-[10px] text-slate-400">
            HOS limits: {HOS_DRIVE_LIMIT_H}h drive / {HOS_ON_DUTY_LIMIT_H}h on-duty (Cycle 1, South of 60°N)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedTruckId || (selectedAudit != null && !selectedAudit.compliant)}
              title={!selectedTruckId ? "Select a driver first" : (selectedAudit != null && !selectedAudit.compliant) ? "Axle weight distribution non-compliant" : "Confirm and transmit dispatch offer"}
              onClick={() => {
                if (selectedTruckId) {
                  emitTutorialAction("CONFIRM_ASSIGNMENT");
                  onConfirm(selectedTruckId);
                }
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedTruckId && (selectedAudit?.compliant ?? true)
                  ? "bg-blue-600 text-white hover:bg-blue-500"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
              }`}
            >
              {selectedAudit && !selectedAudit.compliant
                ? "Blocked — Compliance Violation"
                : "Confirm Assignment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
