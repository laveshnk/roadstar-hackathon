import { FREE_DETENTION_MINUTES, DETENTION_RATE_PER_HOUR } from "./config";
import type { DetentionLog } from "./types";

/**
 * Geofence & Detention Billing Engine.
 *
 * FTL detention rule: the first FREE_DETENTION_MINUTES (120) minutes of dock
 * time are free. Billable detention = max(0, total_dock_minutes - 120).
 */

/** Billable detention minutes for a given total dock time (minutes). */
export function calculateBillableMinutes(totalDockMinutes: number): number {
  return Math.max(0, Math.round(totalDockMinutes - FREE_DETENTION_MINUTES));
}

/** Detention fee (CAD) owed for a billable minute count. */
export function calculateDetentionFee(
  billableMinutes: number,
  ratePerHour: number = DETENTION_RATE_PER_HOUR,
): number {
  return Math.round(((billableMinutes / 60) * ratePerHour) * 100) / 100;
}

/** True when a docked truck has exceeded the free allowance -> alert. */
export function isDetentionAlert(totalDockMinutes: number): boolean {
  return totalDockMinutes > FREE_DETENTION_MINUTES;
}

/** Minutes elapsed since an ISO timestamp (0 if future). */
export function minutesSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, (now - new Date(iso).getTime()) / 60000);
}

/** Elapsed minutes between two ISO timestamps (open-ended if end is null). */
export function minutesBetween(
  startISO: string,
  endISO: string | null,
  now: number = Date.now(),
): number {
  const start = new Date(startISO).getTime();
  const end = endISO ? new Date(endISO).getTime() : now;
  return Math.max(0, (end - start) / 60000);
}

/** Human readable duration, e.g. "1h 45m". */
export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h <= 0) return `${mins}m`;
  return `${h}h ${String(mins).padStart(2, "0")}m`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Recompute an (active or closed) detention log against "now".
 * Active logs (departure_time == null) keep ticking up in real time.
 */
export function computeDetention(
  log: DetentionLog,
  now: number = Date.now(),
): DetentionLog {
  const total =
    log.status === "ACTIVE"
      ? minutesBetween(log.arrival_time, log.departure_time, now)
      : log.total_dock_minutes;
  const billable = calculateBillableMinutes(total);
  const fee = calculateDetentionFee(billable);
  return {
    ...log,
    total_dock_minutes: Math.round(total),
    billable_detention_minutes: billable,
    detention_fee_owed: fee,
  };
}
