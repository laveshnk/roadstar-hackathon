import { DETENTION_RATE_PER_HOUR, FREE_DETENTION_MINUTES } from "../config.js";
import type { Facility } from "../types.js";

/**
 * Detention billing engine.
 *
 * FTL rule: the first FREE_DETENTION_MINUTES (120) minutes of dock time are
 * free. Billable detention = max(0, total_dock_minutes - 120).
 */

export function billableDetentionMinutes(dockWaitMinutes: number): number {
  return Math.max(0, Math.round(dockWaitMinutes - FREE_DETENTION_MINUTES));
}

export function detentionFeeOwed(billableMinutes: number): number {
  return (
    Math.round(((billableMinutes / 60) * DETENTION_RATE_PER_HOUR) * 100) / 100
  );
}

/** Only customer docks & terminals accrue billable detention (hub yards do not). */
export function isBillableFacility(facility: Facility | undefined): boolean {
  return !!facility && facility.type !== "HUB";
}
