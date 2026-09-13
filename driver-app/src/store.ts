/**
 * Zustand store — the single source of truth for the driver ELD app.
 * Supports multi-driver switching with per-driver HOS cycle balances.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HOS_DRIVE_LIMIT_H, HOS_ON_DUTY_LIMIT_H, HOS_CYCLE_LIMIT_H, FREE_DETENTION_MINUTES, FLEET_ROSTER } from "./types.ts";
import type { FleetDriver, DutyStatus, DispatchStage, DispatchEvent, DriverProfile, LoadOrder, LoadOffer } from "./types.ts";
import { fleetSync } from "./sync.ts";

const DEFAULT_DRIVER: DriverProfile = { driverId: "1", driverName: "Driver1", truckId: "B3340", truckNumber: "B3340" };
const DEFAULT_LOAD: LoadOrder = { orderId: "SQ-TOUR-001", customer: "MONDELEZ INTERNATIONAL c/o UBER FREIGHT", originCity: "Milton, ON", destinationCity: "London, ON", weightLbs: 24000, cargoType: "Reefer", tempControlled: true, temperature: "60°F", targetRate: 1450 };

const DISPATCH_FLOW: { stage: DispatchStage; label: string }[] = [
  { stage: "PENDING", label: "Accept Load" },
  { stage: "ACCEPTED", label: "Arrived at Shipper" },
  { stage: "AT_SHIPPER", label: "Start Loading" },
  { stage: "EN_ROUTE", label: "Depart Shipper" },
  { stage: "EN_ROUTE", label: "Arrived at Receiver" },
  { stage: "AT_RECEIVER", label: "Complete POD" },
  { stage: "COMPLETED", label: "Delivery Complete" },
];

export function nextDispatchAction(stage: DispatchStage): string {
  return DISPATCH_FLOW.find((d) => d.stage === stage)?.label ?? "Complete";
}
export const DISPATCH_STAGES = DISPATCH_FLOW;
export { FLEET_ROSTER };

function broadcast(driver: DriverProfile, type: DispatchEvent["type"], data: Record<string, unknown>): void {
  fleetSync.broadcast({ type, truckId: driver.truckId, driverId: driver.driverId, timestamp: new Date().toISOString(), data });
}

export interface DriverState {
  driver: DriverProfile;
  load: LoadOrder;
  dutyStatus: DutyStatus;
  driveSecondsToday: number;
  onDutySecondsToday: number;
  cycleHoursUsed: number;
  cycleInitialRemaining: number;
  dispatchStage: DispatchStage;
  dockArrivalTime: string | null;
  delayTags: { id: string; label: string; minutes: number; timestamp: string }[];
  notifications: string[];
  loadOffered: boolean;
  incomingOffer: LoadOffer | null;
  setDutyStatus: (status: DutyStatus) => void;
  advanceDispatch: () => void;
  startDockTimer: () => void;
  stopDockTimer: () => void;
  reportTrafficDelay: () => void;
  requestEmergencyRest: () => void;
  tick: (deltaSeconds: number) => void;
  addNotification: (msg: string) => void;
  clearNotifications: () => void;
  resetAll: () => void;
  switchDriver: (fleetDriver: FleetDriver) => void;
  acceptLoad: () => void;
  declineLoad: () => void;
  receiveOffer: (offer: LoadOffer) => void;
  acceptOffer: () => void;
  declineOffer: (reason: string) => void;
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set, get) => ({
      driver: DEFAULT_DRIVER,
      load: DEFAULT_LOAD,
      dutyStatus: "OFF_DUTY",
      driveSecondsToday: 0,
      onDutySecondsToday: 0,
      cycleHoursUsed: HOS_CYCLE_LIMIT_H - 44.7,
      cycleInitialRemaining: 44.7,
      dispatchStage: "PENDING",
      dockArrivalTime: null,
      delayTags: [],
      notifications: [],
      loadOffered: true,
      incomingOffer: null,

      setDutyStatus: (status) => {
        const { driver } = get();
        broadcast(driver, "DUTY_STATUS_CHANGE", { status, prev: get().dutyStatus });
        set({ dutyStatus: status });
      },

      advanceDispatch: () => {
        const state = get();
        const idx = DISPATCH_FLOW.findIndex((d) => d.stage === state.dispatchStage);
        const next = DISPATCH_FLOW[Math.min(idx + 1, DISPATCH_FLOW.length - 1)];
        if (!next || next.stage === state.dispatchStage) return;
        const { driver, load } = state;
        broadcast(driver, "DISPATCH_STAGE_CHANGE", { stage: next.stage, orderId: load.orderId });
        if (next.stage === "AT_SHIPPER" || next.stage === "AT_RECEIVER") {
          set({ dispatchStage: next.stage, dockArrivalTime: new Date().toISOString() });
        } else { set({ dispatchStage: next.stage, dockArrivalTime: null }); }
        if (next.stage === "COMPLETED") get().addNotification(`Delivery complete: ${load.orderId} — POD submitted.`);
      },

      startDockTimer: () => { if (!get().dockArrivalTime) set({ dockArrivalTime: new Date().toISOString() }); },
      stopDockTimer: () => set({ dockArrivalTime: null }),

      reportTrafficDelay: () => {
        const { driver } = get();
        const tag = { id: `delay-${Date.now()}`, label: "Hwy 401 Traffic Delay", minutes: 45, timestamp: new Date().toISOString() };
        // Broadcast DRIVER_DELAY with full data so the dispatcher dashboard
        // can show a proactive alert toast.
        broadcast(driver, "DRIVER_DELAY", {
          truckId: driver.truckId, driverId: driver.driverId, driverName: driver.driverName,
          delayMinutes: 45, location: "Hwy 401 Corridor", timestamp: new Date().toISOString(),
        });
        set((s) => ({ delayTags: [...s.delayTags, tag] }));
        get().addNotification("🚨 Hwy 401 delay reported to dispatch (+45 min).");
      },

      requestEmergencyRest: () => {
        broadcast(get().driver, "INCIDENT_REPORT", { type: "EMERGENCY_REST" });
        broadcast(get().driver, "DUTY_STATUS_CHANGE", { status: "SLEEPER", reason: "Emergency HOS rest break" });
        set({ dutyStatus: "SLEEPER" });
        get().addNotification("🛑 Emergency rest break requested — duty set to Sleeper Berth.");
      },

      tick: (deltaSeconds) => {
        const s = get();
        let { driveSecondsToday, onDutySecondsToday } = s;
        if (s.dutyStatus === "DRIVING") { driveSecondsToday += deltaSeconds; onDutySecondsToday += deltaSeconds; }
        else if (s.dutyStatus === "ON_DUTY") { onDutySecondsToday += deltaSeconds; }
        set({ driveSecondsToday, onDutySecondsToday });
      },

      addNotification: (msg) => set((s) => ({ notifications: [...s.notifications, msg] })),
      clearNotifications: () => set({ notifications: [] }),

      resetAll: () => set({
        dutyStatus: "OFF_DUTY", driveSecondsToday: 0, onDutySecondsToday: 0,
        cycleHoursUsed: HOS_CYCLE_LIMIT_H - 44.7, dispatchStage: "PENDING",
        dockArrivalTime: null, delayTags: [], notifications: [], loadOffered: true, incomingOffer: null,
      }),

      switchDriver: (fleetDriver: FleetDriver) => {
        const prev = get();
        broadcast(prev.driver, "DRIVER_SWITCH", { from: prev.driver.driverId, to: fleetDriver.driverId });
        const newCycleRemaining = fleetDriver.hosRemainingHours;
        set({
          driver: { driverId: fleetDriver.driverId, driverName: fleetDriver.driverName, truckId: fleetDriver.truckId, truckNumber: fleetDriver.truckNumber },
          cycleHoursUsed: HOS_CYCLE_LIMIT_H - newCycleRemaining,
          cycleInitialRemaining: newCycleRemaining,
          driveSecondsToday: 0, onDutySecondsToday: 0, dutyStatus: "OFF_DUTY",
          dispatchStage: fleetDriver.assignedLoadId ? "EN_ROUTE" : "PENDING",
          dockArrivalTime: null, delayTags: [], loadOffered: !fleetDriver.assignedLoadId,
          incomingOffer: null,
        });
        get().addNotification(`Switched to ${fleetDriver.driverName} (Truck ${fleetDriver.truckNumber}). HOS: ${newCycleRemaining.toFixed(1)}h remaining.`);
      },

      acceptLoad: () => {
        const { driver, load } = get();
        broadcast(driver, "LOAD_DECISION", { orderId: load.orderId, decision: "ACCEPTED" });
        broadcast(driver, "DISPATCH_STAGE_CHANGE", { stage: "ACCEPTED", orderId: load.orderId });
        // Broadcast DISPATCH_ACCEPTED for the dispatcher dashboard handshake.
        broadcast(driver, "DISPATCH_ACCEPTED", {
          loadId: load.orderId, driverId: driver.driverId, truckId: driver.truckId,
          timestamp: new Date().toISOString(),
        });
        set({ dispatchStage: "ACCEPTED", loadOffered: false });
        get().addNotification(`✅ Load ${load.orderId} accepted.`);
      },

      declineLoad: () => {
        const { driver, load } = get();
        broadcast(driver, "LOAD_DECISION", { orderId: load.orderId, decision: "DECLINED" });
        // Broadcast DISPATCH_REJECTED for the dispatcher dashboard handshake.
        broadcast(driver, "DISPATCH_REJECTED", {
          loadId: load.orderId, driverId: driver.driverId, truckId: driver.truckId,
          reason: "Driver declined", timestamp: new Date().toISOString(),
        });
        set({ loadOffered: false, dispatchStage: "COMPLETED" });
        get().addNotification(`❌ Load ${load.orderId} declined.`);
      },

      receiveOffer: (offer: LoadOffer) => {
        // Only accept offers targeted at the currently active driver's truck.
        if (offer.truckId !== get().driver.truckId) return;
        set({ incomingOffer: offer });
        get().addNotification(`📬 Incoming dispatch offer: ${offer.origin} → ${offer.destination}.`);
      },

      acceptOffer: () => {
        const { driver, incomingOffer } = get();
        if (!incomingOffer) return;
        // Set duty to On-Duty (Not Driving), stage to En Route to Shipper.
        broadcast(driver, "DISPATCH_ACCEPTED", {
          loadId: incomingOffer.loadId, driverId: driver.driverId, truckId: driver.truckId,
          timestamp: new Date().toISOString(),
        });
        broadcast(driver, "DUTY_STATUS_CHANGE", { status: "ON_DUTY", reason: "Load accepted — en route to shipper" });
        set({
          incomingOffer: null,
          dutyStatus: "ON_DUTY",
          dispatchStage: "EN_ROUTE",
          loadOffered: false,
          load: {
            orderId: incomingOffer.loadId,
            customer: incomingOffer.customer,
            originCity: incomingOffer.origin,
            destinationCity: incomingOffer.destination,
            weightLbs: incomingOffer.weightLbs,
            cargoType: incomingOffer.cargoType,
            tempControlled: incomingOffer.tempControlled,
            temperature: incomingOffer.temperature ?? "Ambient",
            targetRate: incomingOffer.payout,
          },
        });
        get().addNotification(`✅ Load ${incomingOffer.loadId} accepted. En route to shipper.`);
      },

      declineOffer: (reason: string) => {
        const { driver, incomingOffer } = get();
        if (!incomingOffer) return;
        broadcast(driver, "DISPATCH_REJECTED", {
          loadId: incomingOffer.loadId, driverId: driver.driverId, truckId: driver.truckId,
          reason, timestamp: new Date().toISOString(),
        });
        set({ incomingOffer: null });
        get().addNotification(`❌ Load ${incomingOffer.loadId} declined: ${reason}.`);
      },
    }),
    {
      name: "apex-driver-eld",
      partialize: (state) => ({
        driver: state.driver, dutyStatus: state.dutyStatus,
        driveSecondsToday: state.driveSecondsToday, onDutySecondsToday: state.onDutySecondsToday,
        cycleHoursUsed: state.cycleHoursUsed, dispatchStage: state.dispatchStage,
        dockArrivalTime: state.dockArrivalTime, delayTags: state.delayTags, loadOffered: state.loadOffered,
        incomingOffer: state.incomingOffer,
      }),
    },
  ),
);

// --- Derived HOS selectors ---
export function driveRemainingHours(state: DriverState): number { return Math.max(0, HOS_DRIVE_LIMIT_H - state.driveSecondsToday / 3600); }
export function onDutyRemainingHours(state: DriverState): number { return Math.max(0, HOS_ON_DUTY_LIMIT_H - state.onDutySecondsToday / 3600); }
export function cycleRemainingHours(state: DriverState): number { return Math.max(0, HOS_CYCLE_LIMIT_H - state.cycleHoursUsed); }
export function dockDwellMinutes(state: DriverState, now: number = Date.now()): number { if (!state.dockArrivalTime) return 0; return Math.max(0, (now - new Date(state.dockArrivalTime).getTime()) / 60000); }
export function isDetentionActive(state: DriverState, now: number = Date.now()): boolean { return dockDwellMinutes(state, now) > FREE_DETENTION_MINUTES; }
