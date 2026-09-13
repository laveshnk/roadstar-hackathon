import type { BreadcrumbPoint, DetentionLog, LatLng } from "./types";
import type { SimTruck } from "./mockData";
import { bearingDeg, haversineKm, lerp } from "./geo";
import {
  calculateBillableMinutes,
  calculateDetentionFee,
  minutesBetween,
} from "./detention";
import { MAX_BREADCRUMB_POINTS, MOVEMENT_INTERVAL_MS, TIME_WARP_FACTOR } from "./config";

/**
 * Live fleet simulation.
 *
 * advanceTruck()    -> advances a single truck one simulation step along its
 *                     planned road polyline (OSRM-fetched or fallback). The
 *                     truck steps by DISTANCE (speed × elapsed time), not by
 *                     index, so it correctly follows dense OSRM road geometry
 *                     with hundreds of points. When an IN_TRANSIT truck
 *                     reaches the end of its route it performs a quick
 *                     turnaround: the direction flips and the truck heads back
 *                     on the return leg, keeping it IN_TRANSIT indefinitely
 *                     (bouncing A→B→A→B). This guarantees 3-5 trucks are
 *                     always on the highway with live speeds of 85-105 km/h.
 *                     DOCKED_WAITING / OFF_DUTY trucks are never advanced
 *                     (they return unchanged), so Truck B3339 stays
 *                     permanently docked at Milton for the detention showcase.
 * activeLogFromTruck() -> projects a live ACTIVE detention log from a docked
 *                     truck's dock session so the billing engine can tick in
 *                     real time without waiting on a persisted write.
 */

/** Clamp speed into the realistic highway range (85–105 km/h) with ±jitter. */
function highwaySpeed(base: number): number {
  const jitter = Math.random() * 8 - 4; // ±4 km/h
  return Math.max(85, Math.min(105, Math.round(base + jitter)));
}

/**
 * Advance a truck along its road polyline by a distance step.
 *
 * Walks from the truck's current fractional position through the polyline,
 * consuming segment-by-segment until `stepKm` is fully travelled. Returns the
 * new fractional position, the exact landing coordinate, the heading at that
 * point, and the actual distance moved (may be less than stepKm at route end).
 */
function advanceAlongRoute(
  route: LatLng[],
  fracIdx: number,
  direction: 1 | -1,
  stepKm: number,
): {
  newFracIdx: number;
  pos: LatLng;
  heading: number;
  movedKm: number;
} {
  let remaining = stepKm;
  let idx = fracIdx;
  let pos = route[Math.floor(idx)] ?? route[0];
  let heading = 0;
  let moved = 0;

  while (remaining > 0.0001) {
    const i = Math.floor(idx);
    const nextI = i + direction;
    if (nextI < 0 || nextI >= route.length) break;

    const segStart = route[i];
    const segEnd = route[nextI];
    const segLen = haversineKm(segStart, segEnd);
    if (segLen < 0.0001) {
      idx = nextI;
      pos = segEnd;
      continue;
    }

    const segFrac = direction === 1 ? idx - i : i - idx + 1;
    const remainingSegKm = segLen * (1 - segFrac);

    if (remaining >= remainingSegKm) {
      remaining -= remainingSegKm;
      moved += remainingSegKm;
      idx = nextI;
      pos = segEnd;
      heading = bearingDeg(segStart, segEnd);
    } else {
      const traverseFrac = remaining / segLen;
      const fullFrac = segFrac + traverseFrac;
      pos = {
        lat: lerp(segStart.lat, segEnd.lat, fullFrac),
        lng: lerp(segStart.lng, segEnd.lng, fullFrac),
      };
      heading = bearingDeg(segStart, segEnd);
      moved += remaining;
      idx = i + (direction === 1 ? fullFrac : -fullFrac);
      remaining = 0;
    }
  }

  return { newFracIdx: idx, pos, heading, movedKm: moved };
}

export function advanceTruck(t: SimTruck, now: number = Date.now()): SimTruck {
  // Only moving trucks advance. Docked / off-duty trucks stay put — this is
  // what keeps B3339 permanently docked for the live detention alert.
  const routePoints = t.routePoints ?? [];
  if (t.current_status !== "IN_TRANSIT" || routePoints.length < 2) return t;

  const dir = t.direction ?? 1;
  const lastIndex = routePoints.length - 1;
  const fracIdx = t.progress ?? 0;

  // Distance to travel this tick: speed (km/h) × elapsed time (hours) × warp.
  // The TIME_WARP_FACTOR accelerates movement so trucks are visibly advancing
  // at regional zoom levels (otherwise 90 km/h × 2s = ~50m is imperceptible).
  const newSpeed = highwaySpeed(t.baseSpeed);
  const stepKm = (newSpeed * MOVEMENT_INTERVAL_MS * TIME_WARP_FACTOR) / 3_600_000;

  let { newFracIdx, pos, heading, movedKm } = advanceAlongRoute(
    routePoints, fracIdx, dir, stepKm,
  );
  let direction: 1 | -1 = dir;

  // Turnaround: if we hit the end (forward) or beginning (reverse), flip
  // direction and consume the remaining distance on the return leg.
  const remainingKm = stepKm - movedKm;
  if (remainingKm > 0.0001) {
    if (dir === 1 && newFracIdx >= lastIndex - 0.01) {
      direction = -1;
      newFracIdx = lastIndex - 0.01;
    } else if (dir === -1 && newFracIdx <= 0.01) {
      direction = 1;
      newFracIdx = 0.01;
    }
    if (direction !== dir) {
      const r2 = advanceAlongRoute(routePoints, newFracIdx, direction, remainingKm);
      newFracIdx = r2.newFracIdx;
      pos = r2.pos;
      heading = r2.heading;
      movedKm += r2.movedKm;
    }
  }

  if (movedKm < 0.0001) return t;

  const newOdo = t.odometer + movedKm;
  const point: BreadcrumbPoint = {
    lat: pos.lat, lng: pos.lng,
    timestamp: new Date(now).toISOString(),
    speed: newSpeed, odometer: Math.round(newOdo),
  };
  const breadcrumb = [...(t.breadcrumb ?? []), point].slice(-MAX_BREADCRUMB_POINTS);

  return {
    ...t,
    progress: newFracIdx,
    direction,
    lat: pos.lat, lng: pos.lng,
    speed: newSpeed, odometer: Math.round(newOdo),
    heading, breadcrumb,
    current_status: "IN_TRANSIT",
    current_facility_id: null,
    dock_arrival_time: null,
  };
}

/** Build a live ACTIVE detention log from a docked truck's dock session. */
export function activeLogFromTruck(
  t: SimTruck,
  loadId: string,
  now: number = Date.now(),
): DetentionLog {
  const arrival = t.dock_arrival_time ?? new Date(now).toISOString();
  const total = minutesBetween(arrival, null, now);
  const billable = calculateBillableMinutes(total);
  const fee = calculateDetentionFee(billable);
  return {
    id: `DL-ACT-${t.id}`,
    load_id: loadId,
    truck_id: t.id,
    facility_id: t.current_facility_id ?? "",
    arrival_time: arrival,
    departure_time: null,
    total_dock_minutes: Math.round(total),
    billable_detention_minutes: billable,
    detention_fee_owed: fee,
    status: "ACTIVE",
  };
}
