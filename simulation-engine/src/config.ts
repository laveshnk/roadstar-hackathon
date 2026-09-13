import "dotenv/config";

/**
 * Central runtime configuration. Values are read from environment variables
 * (optionally via a `.env` file) with safe, validated fallbacks.
 */

function parseNumberEnv(
  name: string,
  fallback: number,
  allowed?: number[],
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    console.warn(
      `[config] ${name}="${raw}" is not a valid number; using default ${fallback}.`,
    );
    return fallback;
  }
  if (allowed && !allowed.includes(n)) {
    console.warn(
      `[config] ${name}=${n} is not in the allowed set ${JSON.stringify(
        allowed,
      )}; using default ${fallback}.`,
    );
    return fallback;
  }
  return n;
}

/** HTTP + WebSocket listen port. */
export const PORT = parseNumberEnv("PORT", 4001);

/**
 * Time-warp multiplier applied to simulation time. 1 = real-time.
 * Supported: 1, 5, 10, 30. Used to rapidly exercise multi-hour dock waits.
 */
export const TIME_WARP_FACTOR = parseNumberEnv("TIME_WARP_FACTOR", 1, [
  1,
  5,
  10,
  30,
]);

/** Simulation tick interval (real wall-clock ms). */
export const TICK_INTERVAL_MS = 1000;

/** Telemetry broadcast cadence (real wall-clock ms) — every 2s for moving trucks. */
export const TELEMETRY_INTERVAL_MS = 2000;

/** FTL detention: first N minutes of dock time are free. */
export const FREE_DETENTION_MINUTES = 120;

/** Detention billing rate (CAD per billable hour, prorated per minute). */
export const DETENTION_RATE_PER_HOUR = 75;

/** Hours-of-Service starting balances (minutes). */
export const HOS_DRIVE_START_MIN = 510;
export const HOS_DUTY_START_MIN = 570;

/**
 * TRK-1002 starts docked with this much wait already accrued. 118 minutes means
 * it crosses the 120m free threshold ~2 minutes after engine start at 1x warp,
 * visibly triggering detention fees.
 */
export const TRK_1002_INITIAL_DOCK_WAIT_MIN = 118;

/** TRK-1003 scripted slowdown (sim-time): triggers after this delay, lasts this long. */
export const SLOWDOWN_TRIGGER_DELAY_MS = 10_000;
export const SLOWDOWN_DURATION_MS = 45_000;
