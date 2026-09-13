import type { DutyStatus, LatLng } from "../types.js";
import { bearingDeg, densify, haversineKm, lerp } from "../lib/geo.js";

/**
 * A planned route: a densified polyline with cumulative kilometre markers so a
 * truck's position can be resolved by distance travelled (speed × time).
 */
export interface Route {
  points: LatLng[];
  cumKm: number[];
  totalKm: number;
}

export function buildRoute(waypoints: LatLng[], perSegment = 8): Route {
  const points = densify(waypoints, perSegment);
  const cumKm: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumKm[i] = cumKm[i - 1] + haversineKm(points[i - 1], points[i]);
  }
  return { points, cumKm, totalKm: cumKm[cumKm.length - 1] };
}

export interface PositionInfo {
  lat: number;
  lng: number;
  heading: number;
  arrived: boolean;
}

/** Resolve a truck's lat/lng/heading for a given distance travelled (km). */
export function positionAt(route: Route, distanceKm: number): PositionInfo {
  const { points, cumKm, totalKm } = route;
  if (distanceKm >= totalKm) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2] ?? last;
    return {
      lat: last.lat,
      lng: last.lng,
      heading: bearingDeg(prev, last),
      arrived: true,
    };
  }
  let i = 0;
  while (i < cumKm.length - 1 && cumKm[i + 1] < distanceKm) i++;
  const a = points[i];
  const b = points[i + 1] ?? a;
  const segLen = cumKm[i + 1] - cumKm[i];
  const frac = segLen > 0 ? (distanceKm - cumKm[i]) / segLen : 0;
  return {
    lat: lerp(a.lat, b.lat, frac),
    lng: lerp(a.lng, b.lng, frac),
    heading: bearingDeg(a, b),
    arrived: false,
  };
}

export type ScenarioType =
  | "SMOOTH_401_TRANSIT"
  | "ACTIVE_DETENTION"
  | "HWY_401_SLOWDOWN"
  | "DOCK_ARRIVAL_GEOFENCE"
  | "OFF_DUTY";

export interface SlowdownState {
  phase: "normal" | "slowed" | "recovered";
  startsAtSim: number;
  endsAtSim: number;
}

/**
 * Full internal truck state. The persisted/emit fields are a strict subset
 * (see TruckSnapshot); the rest drives the live simulation.
 */
export interface SimTruck {
  id: string;
  truck_number: string;
  driver_name: string;
  scenario: ScenarioType;
  route: Route;
  distanceTraveledKm: number;
  baseOdometerKm: number;
  lat: number;
  lng: number;
  speed_kmh: number;
  heading: number;
  duty_status: DutyStatus;
  hos_drive_remaining_min: number;
  hos_duty_remaining_min: number;
  current_facility_id: string | null;
  dock_arrival_time: string | null;
  dock_wait_minutes: number;
  currentGeofences: Set<string>;
  origin_facility_id: string;
  destination_facility_id: string | null;
  startedAt: number; // sim ms
  slowdown?: SlowdownState;
}
