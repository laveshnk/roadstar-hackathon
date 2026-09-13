import { TELEMETRY_INTERVAL_MS } from "../config.js";
import { facilityMap } from "../data/facilities.js";
import {
  billableDetentionMinutes,
  detentionFeeOwed,
  isBillableFacility,
} from "../lib/detention.js";
import { pointInCircle } from "../lib/geo.js";
import { applyHos } from "../lib/hos.js";
import type {
  Facility,
  GeofenceEvent,
  ServerEvent,
  SnapshotData,
  TelemetryEvent,
  TruckSnapshot,
} from "../types.js";
import { targetSpeed, updateSlowdown } from "./scenarios.js";
import { positionAt, type SimTruck } from "./state.js";

/** Round to 6 decimal places (~0.1m precision) for emitted coordinates. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * The Simulator owns the live fleet state and advances it on each tick.
 *
 * Time model: a sim clock (`simNow`) advances by `realElapsed * timeWarp`
 * every tick. Movement, dock-wait accrual, HOS decay and event timestamps all
 * derive from sim time, so TIME_WARP_FACTOR compresses multi-hour dock waits.
 * Telemetry is broadcast on a fixed 2s real-clock cadence (steady for clients
 * regardless of warp).
 */
export class Simulator {
  readonly trucks: SimTruck[];
  readonly facilities: Facility[];
  readonly timeWarp: number;
  onEvent: (event: ServerEvent) => void = () => {};

  private simNow: number;
  private lastTickReal: number;
  private lastTelemetryReal: number;

  constructor(facilities: Facility[], trucks: SimTruck[], timeWarp: number) {
    this.facilities = facilities;
    this.trucks = trucks;
    this.timeWarp = timeWarp;
    const now = Date.now();
    this.simNow = now;
    this.lastTickReal = now;
    this.lastTelemetryReal = now;
    // Resolve initial geofence membership SILENTLY (no enter/exit events).
    for (const t of trucks) {
      t.currentGeofences = this.geofencesAt(t.lat, t.lng);
      t.current_facility_id = this.pickFacility(t, t.currentGeofences);
    }
  }

  /** Current simulation time (ms epoch). */
  get simTime(): number {
    return this.simNow;
  }

  private iso(): string {
    return new Date(this.simNow).toISOString();
  }

  /** Advance the whole fleet one simulation step. */
  tick(): void {
    const nowReal = Date.now();
    const realElapsedMs = Math.min(Math.max(nowReal - this.lastTickReal, 0), 5000);
    this.lastTickReal = nowReal;
    const simElapsedMs = realElapsedMs * this.timeWarp;
    this.simNow += simElapsedMs;
    const simElapsedSec = simElapsedMs / 1000;
    const simElapsedMin = simElapsedSec / 60;

    const geofenceEvents: GeofenceEvent[] = [];
    for (const t of this.trucks) {
      this.stepTruck(t, simElapsedSec, simElapsedMin, geofenceEvents);
    }
    for (const e of geofenceEvents) this.onEvent(e);

    // Broadcast telemetry for moving trucks every 2s (real time).
    if (nowReal - this.lastTelemetryReal >= TELEMETRY_INTERVAL_MS) {
      this.lastTelemetryReal = nowReal;
      const ts = this.iso();
      for (const t of this.trucks) {
        if (t.duty_status === "DRIVING") {
          this.onEvent(this.telemetryEvent(t, ts));
        }
      }
    }
  }

  /** Advance a single truck: motion, arrival/dock, HOS, geofence transitions. */
  private stepTruck(
    t: SimTruck,
    simElapsedSec: number,
    simElapsedMin: number,
    events: GeofenceEvent[],
  ): void {
    updateSlowdown(t, this.simNow);

    if (t.duty_status === "DRIVING") {
      const speed = targetSpeed(t, this.simNow);
      t.speed_kmh = Math.round(speed * 10) / 10;
      if (speed > 0) {
        t.distanceTraveledKm += (speed * simElapsedSec) / 3600;
        const pos = positionAt(t.route, t.distanceTraveledKm);
        t.lat = pos.lat;
        t.lng = pos.lng;
        t.heading = Math.round(pos.heading);
        if (pos.arrived) {
          // Arrived at destination dock -> halt, begin dock wait.
          t.distanceTraveledKm = t.route.totalKm;
          t.speed_kmh = 0;
          t.duty_status = "DOCKED_WAITING";
          t.dock_arrival_time = this.iso();
          t.dock_wait_minutes = 0;
        }
      } else {
        t.speed_kmh = 0;
      }
    } else {
      t.speed_kmh = 0;
      if (t.duty_status === "DOCKED_WAITING" && t.dock_arrival_time) {
        t.dock_wait_minutes += simElapsedMin;
      }
    }

    // Hours-of-Service decay (sim time).
    const hos = applyHos(
      t.duty_status,
      t.hos_drive_remaining_min,
      t.hos_duty_remaining_min,
      simElapsedMin,
    );
    t.hos_drive_remaining_min = hos.drive;
    t.hos_duty_remaining_min = hos.duty;

    // Geofence enter/exit detection (emits events on transition).
    this.updateGeofences(t, events);
  }

  /** Set of facility ids whose geofence currently contains the point. */
  private geofencesAt(lat: number, lng: number): Set<string> {
    const p = { lat, lng };
    const set = new Set<string>();
    for (const f of this.facilities) {
      if (pointInCircle(f, f.radius, p)) set.add(f.id);
    }
    return set;
  }

  /** Choose the most relevant facility id from a membership set (for state). */
  private pickFacility(t: SimTruck, set: Set<string>): string | null {
    if (set.size === 0) return null;
    if (t.destination_facility_id && set.has(t.destination_facility_id)) {
      return t.destination_facility_id;
    }
    for (const f of this.facilities) {
      if (set.has(f.id) && f.type !== "HUB") return f.id;
    }
    const first = set.values().next().value;
    return first ?? null;
  }

  private updateGeofences(t: SimTruck, events: GeofenceEvent[]): void {
    const newSet = this.geofencesAt(t.lat, t.lng);
    const ts = this.iso();
    for (const id of newSet) {
      if (!t.currentGeofences.has(id)) {
        events.push(this.geofenceEvent("GEOFENCE_ENTER", t, id, ts));
      }
    }
    for (const id of t.currentGeofences) {
      if (!newSet.has(id)) {
        events.push(this.geofenceEvent("GEOFENCE_EXIT", t, id, ts));
      }
    }
    t.currentGeofences = newSet;
    t.current_facility_id = this.pickFacility(t, newSet);
  }

  private geofenceEvent(
    event_type: "GEOFENCE_ENTER" | "GEOFENCE_EXIT",
    t: SimTruck,
    facilityId: string,
    ts: string,
  ): GeofenceEvent {
    const f = facilityMap.get(facilityId);
    return {
      type: "GEOFENCE_EVENT",
      data: {
        event_type,
        truck_id: t.id,
        facility_id: facilityId,
        facility_name: f?.name ?? "Unknown",
        lat: round6(t.lat),
        lng: round6(t.lng),
        timestamp: ts,
      },
    };
  }

  private telemetryEvent(t: SimTruck, ts: string): TelemetryEvent {
    return {
      type: "TELEMETRY_UPDATE",
      data: {
        truck_id: t.id,
        driver_name: t.driver_name,
        lat: round6(t.lat),
        lng: round6(t.lng),
        speed_kmh: t.speed_kmh,
        odometer_km: Math.round((t.baseOdometerKm + t.distanceTraveledKm) * 10) / 10,
        heading: t.heading,
        duty_status: t.duty_status,
        hos_drive_remaining_min: Math.round(t.hos_drive_remaining_min),
        hos_duty_remaining_min: Math.round(t.hos_duty_remaining_min),
        timestamp: ts,
      },
    };
  }

  /** Full fleet snapshot (served over HTTP & pushed on WS connect). */
  getSnapshot(): SnapshotData {
    const ts = this.iso();
    return {
      timestamp: ts,
      time_warp_factor: this.timeWarp,
      trucks: this.trucks.map((t) => this.truckSnapshot(t, ts)),
    };
  }

  private truckSnapshot(t: SimTruck, ts: string): TruckSnapshot {
    const f = t.current_facility_id ? facilityMap.get(t.current_facility_id) : undefined;
    const billable = isBillableFacility(f)
      ? billableDetentionMinutes(t.dock_wait_minutes)
      : 0;
    const fee = detentionFeeOwed(billable);
    return {
      truck_id: t.id,
      driver_name: t.driver_name,
      lat: round6(t.lat),
      lng: round6(t.lng),
      speed_kmh: t.speed_kmh,
      odometer_km: Math.round((t.baseOdometerKm + t.distanceTraveledKm) * 10) / 10,
      heading: t.heading,
      duty_status: t.duty_status,
      hos_drive_remaining_min: Math.round(t.hos_drive_remaining_min),
      hos_duty_remaining_min: Math.round(t.hos_duty_remaining_min),
      current_facility_id: t.current_facility_id,
      facility_name: f?.name ?? null,
      dock_arrival_time: t.dock_arrival_time,
      dock_wait_minutes: Math.round(t.dock_wait_minutes),
      billable_detention_minutes: billable,
      detention_fee_owed: fee,
      destination_facility_id: t.destination_facility_id,
      scenario: t.scenario,
      timestamp: ts,
    };
  }
}
