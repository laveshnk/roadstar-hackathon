/**
 * Domain types & Transport Canada HOS constants for the Driver ELD app.
 *
 * HOS regulations (South of 60°N, federal property-carrying):
 *   - 13 hours maximum driving time per day
 *   - 14 hours maximum on-duty window per shift
 *   - 70 hours on duty per 7-day cycle (Cycle 1)
 */

/** ELD duty status as per Transport Canada HOS. */
export type DutyStatus = "DRIVING" | "ON_DUTY" | "SLEEPER" | "OFF_DUTY";

/** Dispatch workflow stages for an active load. */
export type DispatchStage =
  | "PENDING"
  | "ACCEPTED"
  | "AT_SHIPPER"
  | "EN_ROUTE"
  | "AT_RECEIVER"
  | "COMPLETED";

/** HOS regulatory limits (hours). */
export const HOS_DRIVE_LIMIT_H = 13;
export const HOS_ON_DUTY_LIMIT_H = 14;
export const HOS_CYCLE_LIMIT_H = 70;

/** Detention billing rule. */
export const FREE_DETENTION_MINUTES = 120;
export const DETENTION_RATE_PER_HOUR = 75;

/** Driver / truck profile. */
export interface DriverProfile {
  driverId: string;
  driverName: string;
  truckId: string;
  truckNumber: string;
}

/** Active dispatch load order. */
export interface LoadOrder {
  orderId: string;
  customer: string;
  originCity: string;
  destinationCity: string;
  weightLbs: number;
  cargoType: string;
  tempControlled: boolean;
  temperature: string;
  targetRate: number;
}

/**
 * Full fleet roster — 10 active drivers from the seed data.
 * Each entry carries the driver's real Canadian HOS Cycle 1 remaining hours
 * (REMAINING_HOURS_CAN_7) so switching drivers loads their specific balance.
 */
export interface FleetDriver {
  driverId: string;
  driverName: string;
  truckId: string;
  truckNumber: string;
  hosRemainingHours: number;
  assignedLoadId: string | null;
}

export const FLEET_ROSTER: FleetDriver[] = [
  { driverId: "1", driverName: "Driver1", truckId: "B3340", truckNumber: "B3340", hosRemainingHours: 44.7, assignedLoadId: "LD-408982-AA" },
  { driverId: "2", driverName: "Driver2", truckId: "B4602", truckNumber: "B4602", hosRemainingHours: 27.5, assignedLoadId: null },
  { driverId: "3", driverName: "Driver3", truckId: "B4800", truckNumber: "B4800", hosRemainingHours: 15.8, assignedLoadId: "LD-408982-AB" },
  { driverId: "4", driverName: "Driver4", truckId: "B1935", truckNumber: "B1935", hosRemainingHours: 34.7, assignedLoadId: "LD-409019" },
  { driverId: "5", driverName: "Driver5", truckId: "B5500", truckNumber: "B5500", hosRemainingHours: 52.3, assignedLoadId: null },
  { driverId: "6", driverName: "Driver6", truckId: "B3339", truckNumber: "B3339", hosRemainingHours: 70.0, assignedLoadId: "LD-409014" },
  { driverId: "7", driverName: "Driver7", truckId: "B4505", truckNumber: "B4505", hosRemainingHours: 51.0, assignedLoadId: "LD-409021" },
  { driverId: "10", driverName: "Driver10", truckId: "B0610", truckNumber: "B0610", hosRemainingHours: 70.0, assignedLoadId: "LD-409022" },
  { driverId: "12", driverName: "Driver12", truckId: "B9175", truckNumber: "B9175", hosRemainingHours: 70.0, assignedLoadId: null },
  { driverId: "13", driverName: "Driver13", truckId: "B8269", truckNumber: "B8269", hosRemainingHours: -43.8, assignedLoadId: "LD-409023" },
  { driverId: "14", driverName: "Driver14", truckId: "B5794", truckNumber: "B5794", hosRemainingHours: 24.8, assignedLoadId: "LD-409024" },
];

/** A dispatch event broadcast to the simulation engine via WebSocket. */
export interface DispatchEvent {
  type: "DUTY_STATUS_CHANGE" | "DISPATCH_STAGE_CHANGE" | "INCIDENT_REPORT" | "SYNC" | "DRIVER_SWITCH" | "LOAD_DECISION" | "DISPATCH_OFFER" | "DISPATCH_ACCEPTED" | "DISPATCH_REJECTED" | "DRIVER_DELAY";
  truckId: string;
  driverId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/** A load offer received from the dispatcher. */
export interface LoadOffer {
  loadId: string;
  driverId: string;
  truckId: string;
  driverName: string;
  customer: string;
  origin: string;
  destination: string;
  deadheadKm: number;
  weightLbs: number;
  pallets: number;
  cargoType: string;
  tempControlled: boolean;
  temperature: string | null;
  payout: number;
  timestamp: string;
}

