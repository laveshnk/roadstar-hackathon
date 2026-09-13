/**
 * AI Spot-Quote Profit Maximizer Engine.
 *
 * Evaluates driver candidates for a spot-quote load against Transport Canada
 * HOS rules, equipment compatibility, and deadhead economics, then computes a
 * full financial breakdown (gross revenue, transit cost, deadhead fuel, net
 * profit, margin, and win probability).
 */

import type { Facility, Load } from "./types";
import type { SimTruck } from "./mockData";
import { haversineKm } from "./geo";
import { HOS_DRIVE_LIMIT_H } from "./hos";

/** Cost per km for transit (fuel + maintenance + driver wage). */
export const TRANSIT_COST_PER_KM = 1.15;

/** Cost per km for empty deadhead miles (fuel only, no revenue). */
export const DEADHEAD_COST_PER_KM = 1.15;

export type CandidateStatus = "DISQUALIFIED" | "SUBOPTIMAL" | "OPTIMAL";

export interface SpotQuoteCandidate {
  truck: SimTruck;
  driverName: string;
  truckNumber: string;
  status: CandidateStatus;
  reason: string;
  hosRemainingH: number;
  deadheadKm: number;
  deadheadCost: number;
  reeferReady: boolean;
}

export interface SpotQuoteResult {
  load: Load;
  targetRate: number;
  candidates: SpotQuoteCandidate[];
  optimal: SpotQuoteCandidate | null;
  grossRevenue: number;
  transitKm: number;
  transitCost: number;
  deadheadKm: number;
  deadheadCost: number;
  netProfit: number;
  marginPct: number;
  winProbability: number;
}

/**
 * Compute a full spot-quote evaluation for a load across all candidate drivers.
 *
 * @param load         The spot-quote load to evaluate.
 * @param trucks       All trucks in the fleet.
 * @param facilities   Facility registry for coordinate lookup.
 * @param targetRate   The spot-quote target revenue (CAD).
 * @param driverOverrides  Optional per-truckId overrides for driveRemainingH
 *                          (used by the guided tour to pin specific demo values).
 */
export function computeSpotQuote(
  load: Load,
  trucks: SimTruck[],
  facilities: Facility[],
  targetRate: number,
  driverOverrides?: Record<string, { driveRemainingH?: number; status?: CandidateStatus; reason?: string }>,
): SpotQuoteResult {
  const origFac = facilities.find((f) => f.id === load.origin_facility_id);
  const destFac = facilities.find((f) => f.id === load.destination_facility_id);

  const transitKm = origFac && destFac
    ? haversineKm({ lat: origFac.lat, lng: origFac.lng }, { lat: destFac.lat, lng: destFac.lng })
    : 0;

  const transitCost = Math.round(transitKm * TRANSIT_COST_PER_KM * 100) / 100;

  const candidates: SpotQuoteCandidate[] = trucks
    .filter((t) => t.current_status !== "OFF_DUTY" || driverOverrides?.[t.id])
    .map((t) => {
      const override = driverOverrides?.[t.id];
      const cycleRemaining = t.hos_remaining_hours ?? 0;
      // Daily drive remaining: use override if provided, else derive from cycle.
      const hosRemainingH = override?.driveRemainingH ?? Math.min(cycleRemaining, HOS_DRIVE_LIMIT_H);

      // Deadhead: distance from truck's current position to the load origin.
      let deadheadKm = 0;
      if (origFac) {
        deadheadKm = haversineKm(
          { lat: t.lat, lng: t.lng },
          { lat: origFac.lat, lng: origFac.lng },
        );
      }
      const deadheadCost = Math.round(deadheadKm * DEADHEAD_COST_PER_KM * 100) / 100;
      const reeferReady = !load.temp_controlled; // simplified: dry van trucks can handle dry loads

      // Determine status.
      let status: CandidateStatus = "OPTIMAL";
      let reason = `${hosRemainingH.toFixed(1)}h HOS remaining, ${deadheadKm.toFixed(0)} km deadhead${reeferReady ? ", Reefer ready" : ""}.`;

      if (override?.status) {
        status = override.status;
        reason = override.reason ?? reason;
      } else if (hosRemainingH <= 0) {
        status = "DISQUALIFIED";
        reason = "No remaining HOS hours (Cycle 1 exhausted).";
      } else if (transitKm / 90 > hosRemainingH) {
        status = "DISQUALIFIED";
        const over = Math.round((transitKm / 90 - hosRemainingH) * 60);
        reason = `Only ${hosRemainingH.toFixed(1)}h remaining on daily driving clock (${HOS_DRIVE_LIMIT_H}h rule violation, ${over} mins over).`;
      } else if (deadheadKm > 30) {
        status = "SUBOPTIMAL";
        reason = `${deadheadKm.toFixed(0)} km empty deadhead ($${deadheadCost.toFixed(0)} fuel waste).`;
      }

      return {
        truck: t,
        driverName: t.driver_name,
        truckNumber: t.truck_number,
        status,
        reason,
        hosRemainingH,
        deadheadKm,
        deadheadCost,
        reeferReady,
      };
    })
    .sort((a, b) => {
      // OPTIMAL first, then SUBOPTIMAL, then DISQUALIFIED.
      const order: Record<CandidateStatus, number> = { OPTIMAL: 0, SUBOPTIMAL: 1, DISQUALIFIED: 2 };
      return order[a.status] - order[b.status];
    });

  const optimal = candidates.find((c) => c.status === "OPTIMAL") ?? null;

  const deadheadKm = optimal?.deadheadKm ?? 0;
  const deadheadCost = optimal?.deadheadCost ?? 0;
  const grossRevenue = targetRate;
  const netProfit = Math.round((grossRevenue - transitCost - deadheadCost) * 100) / 100;
  const marginPct = grossRevenue > 0 ? Math.round((netProfit / grossRevenue) * 1000) / 10 : 0;

  // Win probability: higher margin + lower deadhead = higher probability.
  const winProbability = optimal
    ? Math.min(99, Math.max(50, Math.round(60 + marginPct / 5 - deadheadKm / 10)))
    : 0;

  return {
    load,
    targetRate,
    candidates,
    optimal,
    grossRevenue,
    transitKm: Math.round(transitKm),
    transitCost,
    deadheadKm: Math.round(deadheadKm),
    deadheadCost,
    netProfit,
    marginPct,
    winProbability,
  };
}
