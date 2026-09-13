import type { DutyStatus } from "../types.js";

/**
 * Hours-of-Service bookkeeping.
 *
 *  - DRIVING             -> consumes both drive & on-duty time.
 *  - DOCKED_WAITING      -> on-duty (waiting at dock): consumes on-duty time only.
 *  - ON_DUTY_NOT_DRIVING -> consumes on-duty time only.
 *  - OFF_DUTY            -> consumes neither.
 *
 * Returns clamped (>= 0) remaining balances.
 */
export function applyHos(
  status: DutyStatus,
  driveRemainingMin: number,
  dutyRemainingMin: number,
  simElapsedMin: number,
): { drive: number; duty: number } {
  let drive = driveRemainingMin;
  let duty = dutyRemainingMin;
  switch (status) {
    case "DRIVING":
      drive -= simElapsedMin;
      duty -= simElapsedMin;
      break;
    case "DOCKED_WAITING":
    case "ON_DUTY_NOT_DRIVING":
      duty -= simElapsedMin;
      break;
    case "OFF_DUTY":
      break;
  }
  return { drive: Math.max(0, drive), duty: Math.max(0, duty) };
}
