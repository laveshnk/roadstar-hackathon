/**
 * Axle Weight Distribution Engine — Ontario MTO Regulation Compliance.
 *
 * Ontario MTO limits (Highway Traffic Act):
 *   - Steer axle:      12,500 lbs max
 *   - Drive tandem:     34,000 lbs max (20,000 per axle, 34k combined)
 *   - Trailer tandem:  34,000 lbs max (20,000 per axle, 34k combined)
 *   - Max Payload:      44,500 lbs (cargo only)
 *   - Max GVWR:         80,000 lbs (gross vehicle weight = cargo + tare)
 *   - Tare (empty tractor + trailer): ~33,000 lbs
 */

/** Ontario MTO axle weight limits (lbs). */
export const AXLE_LIMITS = {
  steer: 12500,
  driveTandem: 34000,
  trailerTandem: 34000,
  payload: 44500,
  gross: 80000, // GVWR legal max
};

/** Empty tractor + trailer tare weight (lbs). */
export const TARE_WEIGHT_LBS = 33000;

/** Steer axle tare (front of tractor). */
export const STEER_TARE = 10000;
/** Drive tandem tare. */
export const DRIVE_TARE = 11000;
/** Trailer tandem tare. */
export const TRAILER_TARE = 12000;

// --------------------------------------------------------------------------- //
// Driver-Equipment profiles (per-truck axle/tare configuration)
// --------------------------------------------------------------------------- //

export type TrailerType = "DRY_VAN_53" | "REEFER_53" | "TANDEM_AXLE";

export interface DriverEquipment {
  driverId: string;
  driverName: string;
  tractorTareLbs: number;
  trailerTareLbs: number;
  trailerType: TrailerType;
  maxSteerAxleLbs: number;
  maxDriveAxleLbs: number;
  maxTrailerAxleLbs: number;
  /** Existing freight weight or axle offset (e.g., shifted slider pin). */
  residualPayloadLbs: number;
}

/** The fail-state driver: shifted axle slider pin causes tandem overload. */
export const EQUIP_TRK_1002: DriverEquipment = {
  driverId: "TRK-1002",
  driverName: "S. Patel",
  tractorTareLbs: 18500,
  trailerTareLbs: 14500,
  trailerType: "DRY_VAN_53",
  maxSteerAxleLbs: 12500,
  maxDriveAxleLbs: 34000,
  maxTrailerAxleLbs: 34000,
  // Residual deck weight + shifted slider pin → tandem gets extra payload share.
  residualPayloadLbs: 5200,
};

/** The pass-state driver: clean tare, centered tandem sliders. */
export const EQUIP_TRK_1005: DriverEquipment = {
  driverId: "TRK-1005",
  driverName: "R. Kowalski",
  tractorTareLbs: 18500,
  trailerTareLbs: 12000,
  trailerType: "DRY_VAN_53",
  maxSteerAxleLbs: 12500,
  maxDriveAxleLbs: 34000,
  maxTrailerAxleLbs: 34000,
  residualPayloadLbs: 0,
};

/** Default clean equipment for all other drivers. */
export const EQUIP_DEFAULT: DriverEquipment = {
  driverId: "DEFAULT",
  driverName: "Standard Fleet",
  tractorTareLbs: 18500,
  trailerTareLbs: 12000,
  trailerType: "DRY_VAN_53",
  maxSteerAxleLbs: 12500,
  maxDriveAxleLbs: 34000,
  maxTrailerAxleLbs: 34000,
  residualPayloadLbs: 0,
};

/** Look up a driver's equipment profile by truck ID. */
export function getDriverEquipment(truckId: string | null): DriverEquipment {
  if (!truckId) return EQUIP_DEFAULT;
  if (truckId === "TRK-1002" || truckId === "B4602") return EQUIP_TRK_1002;
  if (truckId === "TRK-1005" || truckId === "B5500" || truckId === "B3340") return EQUIP_TRK_1005;
  return EQUIP_DEFAULT;
}

export interface AxleDistribution {
  steer: number;
  driveTandem: number;
  trailerTandem: number;
  gross: number;
  payload: number;
  steerPct: number;
  drivePct: number;
  trailerPct: number;
  steerOver: boolean;
  driveOver: boolean;
  trailerOver: boolean;
  grossOver: boolean;
  payloadOver: boolean;
  warning: string | null;
  compliant: boolean;
}

/**
 * Calculate axle weight distribution using a driver-specific equipment profile.
 *
 * When `residualPayloadLbs > 0` (e.g., TRK-1002's shifted slider pin), the
 * extra weight is biased toward the trailer tandem, pushing it over the
 * 34,000 lb legal limit for a 42,758 lb load.
 *
 * When `residualPayloadLbs === 0` (e.g., TRK-1005's clean setup), the
 * standard weight-transfer model applies and all axles clear legal limits.
 */
export function calculateAxleDistributionWithEquipment(
  cargoLbs: number,
  equip: DriverEquipment,
): AxleDistribution {
  const payload = cargoLbs;
  const totalPayload = payload + equip.residualPayloadLbs;

  // Weight transfer ratios. When residual exists, bias it toward the trailer
  // tandem (simulating a shifted slider pin pushing weight rearward).
  const steerCargo = payload * 0.05;
  const driveCargo = payload * 0.46;
  const trailerCargo = payload * 0.49 + equip.residualPayloadLbs;

  const steerTare = Math.round(equip.tractorTareLbs * 0.54); // ~10,000
  const driveTare = Math.round(equip.tractorTareLbs * 0.46); // ~8,500
  const trailerTare = equip.trailerTareLbs; // ~14,500

  const steer = Math.round(steerTare + steerCargo);
  const driveTandem = Math.round(driveTare + driveCargo);
  const trailerTandem = Math.round(trailerTare + trailerCargo);
  const gross = steer + driveTandem + trailerTandem;

  const steerOver = steer > equip.maxSteerAxleLbs;
  const driveOver = driveTandem > equip.maxDriveAxleLbs;
  const trailerOver = trailerTandem > equip.maxTrailerAxleLbs;
  const grossOver = gross > AXLE_LIMITS.gross;
  const payloadOver = totalPayload > AXLE_LIMITS.payload;

  let warning: string | null = null;
  if (trailerOver) {
    warning = `⚠️ AXLE OVERLOAD WARNING: Rear Tandem at ${trailerTandem.toLocaleString()} lbs (Limit ${equip.maxTrailerAxleLbs.toLocaleString()} lbs). Tandem axle exceeds Ontario MTO 34,000 lb limit for this truck's slider setup. Reassign to an empty tandem unit.`;
  } else if (driveOver) {
    warning = `⚠️ AXLE OVERWEIGHT RISK: Drive tandem at ${driveTandem.toLocaleString()} lbs (Limit ${equip.maxDriveAxleLbs.toLocaleString()} lbs).`;
  } else if (payloadOver) {
    warning = `⚠️ PAYLOAD EXCEEDED: Cargo + residual is ${totalPayload.toLocaleString()} lbs over the ${AXLE_LIMITS.payload.toLocaleString()} lbs payload capacity.`;
  } else if (grossOver) {
    warning = `⚠️ GROSS WEIGHT EXCEEDED: GVW is ${(gross - AXLE_LIMITS.gross).toLocaleString()} lbs over the ${AXLE_LIMITS.gross.toLocaleString()} lbs legal limit.`;
  }

  const compliant = !payloadOver && !grossOver && !steerOver && !driveOver && !trailerOver;

  return {
    steer,
    driveTandem,
    trailerTandem,
    gross,
    payload: totalPayload,
    steerPct: Math.min(100, (steer / equip.maxSteerAxleLbs) * 100),
    drivePct: Math.min(100, (driveTandem / equip.maxDriveAxleLbs) * 100),
    trailerPct: Math.min(100, (trailerTandem / equip.maxTrailerAxleLbs) * 100),
    steerOver,
    driveOver,
    trailerOver,
    grossOver,
    payloadOver,
    warning,
    compliant,
  };
}

