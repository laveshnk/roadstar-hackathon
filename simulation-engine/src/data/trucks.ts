import type { DutyStatus, LatLng } from "../types.js";
import {
  HOS_DRIVE_START_MIN,
  HOS_DUTY_START_MIN,
  TRK_1002_INITIAL_DOCK_WAIT_MIN,
} from "../config.js";
import {
  buildRoute,
  type ScenarioType,
  type SimTruck,
} from "../simulation/state.js";

interface TruckSpec {
  id: string;
  truck_number: string;
  driver_name: string;
  scenario: ScenarioType;
  waypoints: LatLng[];
  baseOdometerKm: number;
  duty_status: DutyStatus;
  origin_facility_id: string;
  destination_facility_id: string | null;
  initialDockWaitMin?: number;
}

// Truck builder lives inside createInitialTrucks (closes over startedAt).

/** TRK-1001 — Smooth 401 transit: London -> Toronto East Dock. */
const LONDON_TO_TORONTO: LatLng[] = [
  { lat: 42.9849, lng: -81.2453 }, // London Terminal
  { lat: 43.05, lng: -80.95 },
  { lat: 43.128, lng: -80.756 }, // Woodstock (401)
  { lat: 43.22, lng: -80.55 },
  { lat: 43.3, lng: -80.4 },
  { lat: 43.3616, lng: -80.3146 }, // Cambridge (401)
  { lat: 43.42, lng: -80.1 },
  { lat: 43.48, lng: -79.95 },
  { lat: 43.5182, lng: -79.8838 }, // Milton (401)
  { lat: 43.55, lng: -79.78 },
  { lat: 43.585, lng: -79.7 },
  { lat: 43.62, lng: -79.55 },
  { lat: 43.6532, lng: -79.3832 }, // Toronto East Dock
];

/** TRK-1003 — Hwy 401 (Milton -> Toronto East) with a scripted slowdown. */
const MILTON_TO_TORONTO: LatLng[] = [
  { lat: 43.5182, lng: -79.8838 }, // Milton Intermodal Hub
  { lat: 43.55, lng: -79.8 },
  { lat: 43.57, lng: -79.74 },
  { lat: 43.585, lng: -79.7 },
  { lat: 43.6, lng: -79.66 },
  { lat: 43.615, lng: -79.645 },
  { lat: 43.625, lng: -79.56 },
  { lat: 43.64, lng: -79.48 },
  { lat: 43.6532, lng: -79.3832 }, // Toronto East Dock
];

/** TRK-1004 — Final leg into Mississauga Dixie Dock (geofence arrival trigger). */
const INTO_MISSISSAUGA_DIXIE: LatLng[] = [
  { lat: 43.585, lng: -79.72 },
  { lat: 43.6, lng: -79.68 },
  { lat: 43.618, lng: -79.645 },
  { lat: 43.6315, lng: -79.6082 }, // Mississauga Dixie Dock
];

const CAMBRIDGE_DOCK: LatLng[] = [{ lat: 43.3616, lng: -80.3146 }];
const LONDON_TERMINAL: LatLng[] = [{ lat: 42.9849, lng: -81.2453 }];

/**
 * Build the initial fleet for the 5 pre-programmed scenarios.
 * `startedAt` is the engine's sim-clock origin (ms).
 */
export function createInitialTrucks(startedAt: number): SimTruck[] {
  const build = (spec: TruckSpec): SimTruck => {
    const route = buildRoute(spec.waypoints);
    const start = spec.waypoints[0];
    const dockArrival =
      spec.initialDockWaitMin != null
        ? new Date(startedAt - spec.initialDockWaitMin * 60000).toISOString()
        : null;
    return {
      id: spec.id,
      truck_number: spec.truck_number,
      driver_name: spec.driver_name,
      scenario: spec.scenario,
      route,
      distanceTraveledKm: 0,
      baseOdometerKm: spec.baseOdometerKm,
      lat: start.lat,
      lng: start.lng,
      speed_kmh: spec.duty_status === "DRIVING" ? 100 : 0,
      heading: 0,
      duty_status: spec.duty_status,
      hos_drive_remaining_min: HOS_DRIVE_START_MIN,
      hos_duty_remaining_min: HOS_DUTY_START_MIN,
      current_facility_id: null, // resolved by Simulator geofence init
      dock_arrival_time: dockArrival,
      dock_wait_minutes: spec.initialDockWaitMin ?? 0,
      currentGeofences: new Set<string>(), // resolved by Simulator geofence init
      origin_facility_id: spec.origin_facility_id,
      destination_facility_id: spec.destination_facility_id,
      startedAt,
      slowdown:
        spec.scenario === "HWY_401_SLOWDOWN"
          ? { phase: "normal", startsAtSim: 0, endsAtSim: 0 }
          : undefined,
    };
  };
  return [
    // 1. Smooth 401 transit (London -> Toronto East).
    build({
      id: "TRK-1001",
      truck_number: "1001",
      driver_name: "D. Tremblay",
      scenario: "SMOOTH_401_TRANSIT",
      waypoints: LONDON_TO_TORONTO,
      baseOdometerKm: 614250,
      duty_status: "DRIVING",
      origin_facility_id: "FAC-LONDON-TERMINAL",
      destination_facility_id: "FAC-TORONTO-EAST",
    }),
    // 2. Active detention at Cambridge (starts ~118m, crosses 120m free threshold).
    build({
      id: "TRK-1002",
      truck_number: "1002",
      driver_name: "S. Patel",
      scenario: "ACTIVE_DETENTION",
      waypoints: CAMBRIDGE_DOCK,
      baseOdometerKm: 602980,
      duty_status: "DOCKED_WAITING",
      origin_facility_id: "FAC-LONDON-TERMINAL",
      destination_facility_id: "FAC-CAMBRIDGE-DOCK",
      initialDockWaitMin: TRK_1002_INITIAL_DOCK_WAIT_MIN,
    }),
    // 3. Hwy 401 slowdown event near Milton.
    build({
      id: "TRK-1003",
      truck_number: "1003",
      driver_name: "M. Okafor",
      scenario: "HWY_401_SLOWDOWN",
      waypoints: MILTON_TO_TORONTO,
      baseOdometerKm: 590410,
      duty_status: "DRIVING",
      origin_facility_id: "FAC-MILTON-HUB",
      destination_facility_id: "FAC-TORONTO-EAST",
    }),
    // 4. Dock arrival & geofence trigger at Mississauga Dixie.
    build({
      id: "TRK-1004",
      truck_number: "1004",
      driver_name: "J. Nguyen",
      scenario: "DOCK_ARRIVAL_GEOFENCE",
      waypoints: INTO_MISSISSAUGA_DIXIE,
      baseOdometerKm: 577330,
      duty_status: "DRIVING",
      origin_facility_id: "FAC-MILTON-HUB",
      destination_facility_id: "FAC-MISSISSAUGA-DIXIE",
    }),
    // 5. Off-duty at London Terminal.
    build({
      id: "TRK-1005",
      truck_number: "1005",
      driver_name: "R. Kowalski",
      scenario: "OFF_DUTY",
      waypoints: LONDON_TERMINAL,
      baseOdometerKm: 631200,
      duty_status: "OFF_DUTY",
      origin_facility_id: "FAC-LONDON-TERMINAL",
      destination_facility_id: null,
    }),
  ];
}

