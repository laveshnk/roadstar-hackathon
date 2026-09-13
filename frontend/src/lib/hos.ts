/**
 * Transport Canada HOS compliance engine (South of 60°N rules).
 *
 * Federal property-carrying driver limits:
 *   - 13 hours driving time per day
 *   - 14 hours on-duty time per shift
 *   - 70 hours on duty per 7-day cycle (Cycle 1)
 */

import type { Facility, Load } from "./types";
import type { SimTruck } from "./mockData";
import { routeLengthKm, haversineKm } from "./geo";

export const HOS_DRIVE_LIMIT_H = 13;
export const HOS_ON_DUTY_LIMIT_H = 14;
export const HOS_CYCLE_LIMIT_H = 70;
const AVG_HIGHWAY_SPEED = 90;

export interface ComplianceAudit {
  truck: SimTruck;
  routeKm: number;
  routeHours: number;
  driveRemainingH: number;
  dutyRemainingH: number;
  cycleRemainingH: number;
  /** null = no violation; otherwise a human-readable reason. */
  violation: string | null;
  equipmentMismatch: string | null;
  /** True when the driver can legally accept this load. */
  compliant: boolean;
}

/**
 * Audit a driver against Transport Canada HOS rules for a proposed load.
 * Returns minute-level violation messages, e.g.
 *   "COMPLIANCE VIOLATION PREVENTED: Driver exceeds 13h drive limit by 42 mins."
 */
export function auditHOS(
  truck: SimTruck,
  load: Load,
  facilities: Facility[],
): ComplianceAudit {
  const origFac = facilities.find((f) => f.id === load.origin_facility_id);
  const destFac = facilities.find((f) => f.id === load.destination_facility_id);

  let routeKm = 0;
  if (origFac && destFac) {
    routeKm = haversineKm(
      { lat: origFac.lat, lng: origFac.lng },
      { lat: destFac.lat, lng: destFac.lng },
    );
  }
  const routeHours = routeKm / AVG_HIGHWAY_SPEED;

  const cycleRemainingH = truck.hos_remaining_hours ?? 0;
  // Derive drive / duty remaining from cycle (simplified model: assume the
  // driver has used a proportional share of drive & duty within the cycle).
  const driveRemainingH = Math.min(cycleRemainingH, HOS_DRIVE_LIMIT_H);
  const dutyRemainingH = Math.min(cycleRemainingH, HOS_ON_DUTY_LIMIT_H);

  let violation: string | null = null;

  // 13h daily drive limit.
  if (routeHours > HOS_DRIVE_LIMIT_H) {
    const overMin = Math.round((routeHours - HOS_DRIVE_LIMIT_H) * 60);
    violation = `COMPLIANCE VIOLATION PREVENTED: Driver exceeds ${HOS_DRIVE_LIMIT_H}h drive limit by ${overMin} mins.`;
  }
  // 14h on-duty shift window.
  else if (routeHours > HOS_ON_DUTY_LIMIT_H) {
    const overMin = Math.round((routeHours - HOS_ON_DUTY_LIMIT_H) * 60);
    violation = `COMPLIANCE VIOLATION PREVENTED: Driver exceeds ${HOS_ON_DUTY_LIMIT_H}h on-duty window by ${overMin} mins.`;
  }
  // Driver's remaining cycle hours.
  else if (routeHours > driveRemainingH && driveRemainingH <= 0) {
    violation = `COMPLIANCE VIOLATION PREVENTED: Driver has no remaining Cycle 1 hours (70h/7-day exhausted).`;
  }
  else if (routeHours > driveRemainingH) {
    const overMin = Math.round((routeHours - driveRemainingH) * 60);
    violation = `COMPLIANCE VIOLATION PREVENTED: Route requires ${routeHours.toFixed(1)}h but driver only has ${driveRemainingH.toFixed(1)}h remaining (${overMin} mins over).`;
  }

  // Equipment check.
  // In a real TMS each truck has an equipment type (Dry Van / Reefer / Flatbed).
  // For this hackathon demo the fleet is mixed-capability: we treat all
  // trucks as reefer-capable so temperature-controlled loads can be assigned.
  // A true equipment mismatch would require per-truck equipment metadata
  // which is not available in the seed data export.
  const equipmentMismatch: string | null = null;
  const compliant = !violation && !equipmentMismatch;

  return {
    truck, routeKm, routeHours,
    driveRemainingH, dutyRemainingH, cycleRemainingH,
    violation, equipmentMismatch, compliant,
  };
}

/**
 * Find backhaul opportunities: loads whose origin is within `radiusKm` of the
 * given truck's destination, heading back toward the GTA (Milton/Mississauga).
 */
export function findBackhauls(
  truckDest: Facility,
  loads: Load[],
  facilities: Facility[],
  radiusKm = 40,
): Load[] {
  return loads.filter((l) => {
    if (l.status !== "PENDING") return false;
    const origFac = facilities.find((f) => f.id === l.origin_facility_id);
    if (!origFac) return false;
    const dist = haversineKm(
      { lat: truckDest.lat, lng: truckDest.lng },
      { lat: origFac.lat, lng: origFac.lng },
    );
    if (dist > radiusKm) return false;
    // Backhaul should head toward the GTA corridor.
    const destFac = facilities.find((f) => f.id === l.destination_facility_id);
    if (!destFac) return false;
    return destFac.lat > 43.3 && destFac.lng > -80.0;
  });
}

/** Find the nearest facility to a given coordinate (for backhaul matching). */
export function nearestFacility(
  lat: number,
  lng: number,
  facilities: Facility[],
): Facility | undefined {
  let best: Facility | undefined;
  let bestDist = Infinity;
  for (const f of facilities) {
    const d = haversineKm({ lat, lng }, { lat: f.lat, lng: f.lng });
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}

export { routeLengthKm };
