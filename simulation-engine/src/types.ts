/**
 * Public event schemas & domain types emitted by the simulation engine.
 *
 * Transport: WebSocket (ws://localhost:4001) + HTTP (GET /api/fleet/snapshot).
 * On WebSocket connect the server immediately pushes a `SNAPSHOT` event.
 */

export type DutyStatus =
  | "DRIVING"
  | "DOCKED_WAITING"
  | "OFF_DUTY"
  | "ON_DUTY_NOT_DRIVING";

export interface LatLng {
  lat: number;
  lng: number;
}

export type FacilityType = "HUB" | "CUSTOMER_DOCK" | "TERMINAL";

export interface Facility {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // metres (circular geofence)
  type: FacilityType;
}

/** Payload of a TELEMETRY_UPDATE event (broadcast every 2s for moving trucks). */
export interface TelemetryData {
  truck_id: string;
  driver_name: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  odometer_km: number;
  heading: number;
  duty_status: DutyStatus;
  hos_drive_remaining_min: number;
  hos_duty_remaining_min: number;
  timestamp: string; // ISO 8601
}

export interface TelemetryEvent {
  type: "TELEMETRY_UPDATE";
  data: TelemetryData;
}

/** Payload of a GEOFENCE_EVENT (emitted on dock arrival / departure). */
export interface GeofenceEventData {
  event_type: "GEOFENCE_ENTER" | "GEOFENCE_EXIT";
  truck_id: string;
  facility_id: string;
  facility_name: string;
  lat: number;
  lng: number;
  timestamp: string; // ISO 8601
}

export interface GeofenceEvent {
  type: "GEOFENCE_EVENT";
  data: GeofenceEventData;
}

/** A single truck's full state as exposed in snapshots. */
export interface TruckSnapshot {
  truck_id: string;
  driver_name: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  odometer_km: number;
  heading: number;
  duty_status: DutyStatus;
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

export interface SnapshotData {
  timestamp: string;
  time_warp_factor: number;
  trucks: TruckSnapshot[];
}

export interface SnapshotEvent {
  type: "SNAPSHOT";
  data: SnapshotData;
}

export type ServerEvent =
  | TelemetryEvent
  | GeofenceEvent
  | SnapshotEvent;
