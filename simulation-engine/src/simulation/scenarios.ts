import {
  SLOWDOWN_DURATION_MS,
  SLOWDOWN_TRIGGER_DELAY_MS,
} from "../config.js";
import type { SimTruck } from "./state.js";

/** Cruising speed with symmetric jitter: base ± halfRange. */
function cruising(base: number, halfRange: number): number {
  return base + (Math.random() * 2 - 1) * halfRange;
}

/**
 * Advance TRK-1003's scripted slowdown state machine (sim-time based):
 *  normal -> (after SLOWDOWN_TRIGGER_DELAY_MS) -> slowed -> (after
 *  SLOWDOWN_DURATION_MS) -> recovered.
 */
export function updateSlowdown(truck: SimTruck, simNow: number): void {
  if (truck.scenario !== "HWY_401_SLOWDOWN" || !truck.slowdown) return;
  const s = truck.slowdown;
  if (s.phase === "normal" && simNow - truck.startedAt >= SLOWDOWN_TRIGGER_DELAY_MS) {
    s.phase = "slowed";
    s.startsAtSim = simNow;
    s.endsAtSim = simNow + SLOWDOWN_DURATION_MS;
    console.log(
      `[TRK-1003] Hwy 401 slowdown triggered near Milton — speed dropping to 12-18 km/h for ${
        SLOWDOWN_DURATION_MS / 1000
      }s`,
    );
  } else if (s.phase === "slowed" && simNow >= s.endsAtSim) {
    s.phase = "recovered";
    console.log(
      "[TRK-1003] Hwy 401 bottleneck cleared — speed recovering to normal cruising",
    );
  }
}

/**
 * Compute the target speed (km/h) for a truck this tick based on its scenario.
 * Returns 0 for non-driving trucks.
 */
export function targetSpeed(truck: SimTruck, _simNow: number): number {
  if (truck.duty_status !== "DRIVING") return 0;
  switch (truck.scenario) {
    case "HWY_401_SLOWDOWN":
      if (truck.slowdown?.phase === "slowed") {
        return 12 + Math.random() * 6; // 12-18 km/h bottleneck
      }
      return cruising(100, 5); // 95-105 km/h
    case "SMOOTH_401_TRANSIT":
      return cruising(97.5, 7.5); // 90-105 km/h
    case "DOCK_ARRIVAL_GEOFENCE":
      return cruising(95, 4); // 91-99 km/h final approach
    default:
      return cruising(100, 5);
  }
}
