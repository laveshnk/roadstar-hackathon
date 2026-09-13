/**
 * Domain models for the Web Dispatcher Dashboard.
 *
 * These TypeScript interfaces mirror the relational tables defined in
 * `src/db/schema.sql`:
 *   - Facility   -> facilities / geofences
 *   - TruckStatus -> truck_status  (live "current state" of each tractor)
 *   - DetentionLog -> detention_logs (one row per dock visit)
 *   - Load        -> loads
 */

export type TruckStatusType = "IN_TRANSIT" | "DOCKED_WAITING" | "OFF_DUTY";

export type FacilityType = "HUB" | "CUSTOMER_DOCK" | "TERMINAL";

// --------------------------------------------------------------------------- //
// Simulation Engine (port 4001) wire protocol types.
// Mirrors simulation-engine/src/types.ts for strict backend connectivity.
// --------------------------------------------------------------------------- //

/** Connection state to the simulation engine. */
export type ConnectionStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED";

/** A single truck's state as broadcast by the simulation engine. */
export interface TruckSnapshot {
  truck_id: string;
  driver_name: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  odometer_km: number;
  heading: number;
  duty_status: "DRIVING" | "DOCKED_WAITING" | "OFF_DUTY" | "ON_DUTY_NOT_DRIVING";
  hos_drive_remaining_min: number;
  hos_duty_remaining_min: number;
  current_facility_id: string | null;
  facility_name: string | null;
  dock_arrival_time: string | null;
  dock_wait_minutes: number;
  billable_detention_minutes: number;
  detention_fee_owed: number;
  destination_facility_id: string | null;
  scenario: string;
  timestamp: string;
}

/** Initial snapshot pushed on WebSocket connect or via REST GET. */
export interface SnapshotData {
  timestamp: string;
  time_warp_factor: number;
  trucks: TruckSnapshot[];
}

/** TELEMETRY_UPDATE event (broadcast every 2s for moving trucks). */
export interface TelemetryData {
  truck_id: string;
  driver_name: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  odometer_km: number;
  heading: number;
  duty_status: "DRIVING" | "DOCKED_WAITING" | "OFF_DUTY" | "ON_DUTY_NOT_DRIVING";
  hos_drive_remaining_min: number;
  hos_duty_remaining_min: number;
  timestamp: string;
}

/** Discriminated union of all server events. */
export type ServerEvent =
  | { type: "SNAPSHOT"; data: SnapshotData }
  | { type: "TELEMETRY_UPDATE"; data: TelemetryData }
  | { type: "GEOFENCE_EVENT"; data: { event_type: "GEOFENCE_ENTER" | "GEOFENCE_EXIT"; truck_id: string; facility_id: string; facility_name: string; lat: number; lng: number; timestamp: string } };

// --------------------------------------------------------------------------- //
// Cross-origin dispatch handshake events (relayed by the WS message broker).
// These flow between the dispatcher dashboard (port 3000) and the driver ELD
// app (port 5174) via the simulation engine's WebSocket on port 4001.
// --------------------------------------------------------------------------- //

/** DISPATCH_OFFER — dispatcher → driver: a new load offer for the driver. */
export interface DispatchOfferData {
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

/** DISPATCH_ACCEPTED — driver → dispatcher: driver accepted the offer. */
export interface DispatchAcceptedData {
  loadId: string;
  driverId: string;
  driverName?: string;
  truckId: string;
  timestamp: string;
}

/** DISPATCH_REJECTED — driver → dispatcher: driver declined the offer. */
export interface DispatchRejectedData {
  loadId: string;
  driverId: string;
  truckId: string;
  reason: string;
  timestamp: string;
}

/** DRIVER_DELAY — driver → dispatcher: driver reported a highway delay. */
export interface DriverDelayData {
  truckId: string;
  driverId: string;
  driverName: string;
  delayMinutes: number;
  location: string;
  timestamp: string;
}

export type DispatchEvent =
  | { type: "DISPATCH_OFFER"; data: DispatchOfferData }
  | { type: "DISPATCH_ACCEPTED"; data: DispatchAcceptedData }
  | { type: "DISPATCH_REJECTED"; data: DispatchRejectedData }
  | { type: "DRIVER_DELAY"; data: DriverDelayData }
  | { type: "INCIDENT_REPORT"; data: DriverDelayData };


export type LoadStatus = "ASSIGNED" | "IN_TRANSIT" | "DELIVERED" | "PENDING" | "OFFERED" | "UNASSIGNED";

export type DetentionStatus = "ACTIVE" | "CLOSED";

/** A single GPS breadcrumb point in a truck's route history. */
export interface BreadcrumbPoint {
  lat: number;
  lng: number;
  timestamp: string; // ISO 8601
  speed: number; // km/h at this point
  odometer: number; // km at this point
}

/** A geographic point. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Facilities / Geofences table.
 * Represents a customer dock, terminal, or hub with a circular geofence
 * (radius in metres). Polygon support is modelled via optional `polygon`.
 */
export interface Facility {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // metres (circular geofence)
  type: FacilityType;
  address: string;
  customer: string;
  polygon?: LatLng[]; // optional polygonal geofence
}

/**
 * TruckStatus table — the live "current state" of each tractor.
 */
export interface TruckStatus {
  id: string;
  truck_number: string;
  driver_name: string;
  lat: number;
  lng: number;
  speed: number; // km/h
  odometer: number; // km
  heading: number; // degrees
  current_status: TruckStatusType;
  current_facility_id: string | null; // set when docked inside a geofence
  dock_arrival_time: string | null; // ISO when truck entered the geofence
  breadcrumb: BreadcrumbPoint[]; // route history (oldest -> newest)
  assigned_load_id: string | null;
  hos_remaining_hours?: number; // Canadian HOS Cycle 1 (70h/7-day) remaining
}

/**
 * DetentionLogs table — one row per dock visit (arrival -> departure).
 * When `departure_time` is null the dock session is still ACTIVE and the
 * billable figures are recomputed live against "now".
 */
export interface DetentionLog {
  id: string;
  load_id: string;
  truck_id: string;
  facility_id: string;
  arrival_time: string; // ISO
  departure_time: string | null; // ISO, null = still docked
  total_dock_minutes: number; // updated live while active
  billable_detention_minutes: number; // max(0, total - FREE_DETENTION_MINUTES)
  detention_fee_owed: number; // CAD
  status: DetentionStatus;
}

export interface Load {
  id: string;
  truck_id: string | null;
  customer: string;
  origin_facility_id: string;
  destination_facility_id: string;
  commodity: string;
  weight_kg: number;
  pickup_time: string; // ISO
  status: LoadStatus;
  // --- Seed-data enrichment (from carrier TMS export) ---
  bill_number?: string | number; // source TMS bill number
  origin_city?: string; // raw origin city name
  destination_city?: string; // raw destination city name
  load_type?: string | null; // equipment: "Dry Van", "Flatbed", "Reefer"
  weight_lbs?: number; // freight weight in pounds (native TMS unit)
  pallets?: number; // pallet count
  temp_controlled?: boolean; // requires climate control
  temperature?: string | null; // temperature setting, e.g. "Ambient", "60 F"
  delivery_appointment_window?: string; // ISO deadline for delivery appointment
  is_urgent_expiring?: boolean; // true if appointment window is within 60 min
}
