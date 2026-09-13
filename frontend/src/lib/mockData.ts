import type {
  BreadcrumbPoint,
  DetentionLog,
  Facility,
  LatLng,
  Load,
  TruckStatus,
  TruckStatusType,
} from "./types";
import { bearingDeg, haversineKm, straightLine, fetchAllRoadRoutes } from "./geo";
import { BREADCRUMB_STEP_MINUTES } from "./config";
import seedData from "./hackathonSeedData.json";

/**
 * A TruckStatus extended with the simulation-only fields needed to drive the
 * live map (planned route, progress index, base speed, origin/destination).
 * The persisted TruckStatus fields are a strict subset of this.
 */
export interface SimTruck extends TruckStatus {
  routePoints: LatLng[];
  progress: number;
  baseSpeed: number;
  origin_facility_id: string;
  destination_facility_id: string | null;
  /** +1 = travelling forward through routePoints, -1 = reversed (return leg). */
  direction: 1 | -1;
}

const NOW = Date.now();
const iso = (offsetMin: number) => new Date(NOW - offsetMin * 60000).toISOString();

/** Build a breadcrumb history (oldest -> newest) from traveled route points. */
function buildBreadcrumb(
  points: LatLng[],
  speed: number,
  startOdo: number,
): BreadcrumbPoint[] {
  let odo = startOdo;
  return points.map((p, i) => {
    if (i > 0) odo += haversineKm(points[i - 1], p);
    return {
      lat: p.lat,
      lng: p.lng,
      timestamp: iso((points.length - 1 - i) * BREADCRUMB_STEP_MINUTES),
      speed,
      odometer: Math.round(odo),
    };
  });
}

interface MakeTruckArgs {
  id: string;
  truck_number: string;
  driver_name: string;
  routePoints: LatLng[];
  progressFrac: number; // 0-1 fraction of route already travelled
  baseSpeed: number;
  startOdo: number;
  status: TruckStatusType;
  origin_facility_id: string;
  destination_facility_id: string | null;
  current_facility_id?: string | null;
  dock_arrival_offset_min?: number | null;
  assigned_load_id?: string | null;
  hos_remaining_hours?: number;
  direction?: 1 | -1;
}

function makeTruck(a: MakeTruckArgs): SimTruck {
  const routePoints = a.routePoints.length > 1 ? a.routePoints : [];
  const lastIndex = routePoints.length > 1 ? routePoints.length - 1 : 0;
  const progress = routePoints.length > 1 ? a.progressFrac * lastIndex : 0;
  const traveledIdx = Math.floor(progress);
  const traveled = routePoints.length > 1 ? routePoints.slice(0, traveledIdx + 1) : [];
  const breadcrumb: BreadcrumbPoint[] = traveled.length
    ? buildBreadcrumb(traveled, a.baseSpeed, a.startOdo)
    : [
        {
          lat: routePoints[0]?.lat ?? 43.5182,
          lng: routePoints[0]?.lng ?? -79.8838,
          timestamp: iso(0),
          speed: 0,
          odometer: a.startOdo,
        },
      ];
  const pos = routePoints.length > 1
    ? (routePoints[traveledIdx] ?? routePoints[0])
    : (routePoints[0] ?? { lat: 43.5182, lng: -79.8838 });
  const last = breadcrumb[breadcrumb.length - 1];
  const heading = traveledIdx > 0 ? bearingDeg(routePoints[traveledIdx - 1], pos) : 0;

  return {
    id: a.id,
    truck_number: a.truck_number,
    driver_name: a.driver_name,
    lat: pos.lat,
    lng: pos.lng,
    speed: a.status === "IN_TRANSIT" ? a.baseSpeed : 0,
    odometer: last.odometer,
    heading,
    current_status: a.status,
    current_facility_id: a.current_facility_id ?? null,
    dock_arrival_time:
      a.dock_arrival_offset_min != null ? iso(a.dock_arrival_offset_min) : null,
    breadcrumb,
    assigned_load_id: a.assigned_load_id ?? null,
    hos_remaining_hours: a.hos_remaining_hours,
    routePoints,
    progress,
    baseSpeed: a.baseSpeed,
    origin_facility_id: a.origin_facility_id,
    destination_facility_id: a.destination_facility_id ?? null,
    direction: a.direction ?? 1,
  };
}

/** Build a truck from a scenario using a straight-line fallback route
 *  (used for the initial synchronous render before OSRM loads). */
function makeTruckFromScenario(
  st: SeedTruck,
  sc: TruckScenario,
): SimTruck {
  const origin = facilityCoord(sc.origin_facility_id);
  if (sc.status !== "IN_TRANSIT" || !sc.destination_facility_id) {
    // Parked / docked truck: single-point route at the facility.
    const pt: LatLng = { lat: origin[0], lng: origin[1] };
    return makeTruck({
      id: st.truck_id,
      truck_number: st.truck_id,
      driver_name: st.driver_name,
      routePoints: [pt],
      progressFrac: 0,
      baseSpeed: sc.baseSpeed,
      startOdo: sc.startOdo,
      status: sc.status,
      origin_facility_id: sc.origin_facility_id,
      destination_facility_id: sc.destination_facility_id,
      current_facility_id: sc.current_facility_id,
      dock_arrival_offset_min: sc.dock_arrival_offset_min,
      assigned_load_id: sc.assigned_load_id,
      hos_remaining_hours: st.hos_remaining_hours,
      direction: sc.direction,
    });
  }
  const dest = facilityCoord(sc.destination_facility_id);
  return makeTruck({
    id: st.truck_id,
    truck_number: st.truck_id,
    driver_name: st.driver_name,
    routePoints: straightLine(origin, dest),
    progressFrac: sc.progress,
    baseSpeed: sc.baseSpeed,
    startOdo: sc.startOdo,
    status: sc.status,
    origin_facility_id: sc.origin_facility_id,
    destination_facility_id: sc.destination_facility_id,
    current_facility_id: sc.current_facility_id,
    dock_arrival_offset_min: sc.dock_arrival_offset_min,
    assigned_load_id: sc.assigned_load_id,
    hos_remaining_hours: st.hos_remaining_hours,
    direction: sc.direction,
  });
}


// --------------------------------------------------------------------------- //
// Seed data types (mirror scripts/ingest_hackathon_data.py output schema)
// --------------------------------------------------------------------------- //
interface SeedTruck {
  truck_id: string;
  driver_id: number;
  driver_name: string;
  lat: number;
  lng: number;
  status: TruckStatusType;
  source_status: string;
  hos_remaining_hours: number;
  assigned_truck: string;
  home_zone: string;
}

interface SeedLoad {
  bill_number: string | number;
  customer: string;
  origin: string;
  destination: string;
  load_type: string;
  load_description: string;
  weight_lbs: number;
  pallets: number;
  temp_controlled: boolean;
  temperature: string;
}

interface SeedDetentionEvent {
  session_id: string;
  driver_name: string;
  trip_number: number;
  freight: string | number;
  pickup_arrival: string;
  delivery_arrival: string;
  origin_zone: string;
  destination_zone: string;
  leg_status: string;
  dispatch_status: string;
  load_type: string;
  weight_lbs: number;
  pallets: number;
  temp_controlled: boolean;
  dock_minutes: number;
  billable_detention_minutes: number;
  detention_fee_owed: number;
}

interface SeedData {
  trucks: SeedTruck[];
  loads: SeedLoad[];
  detention_events: SeedDetentionEvent[];
}

const seed = seedData as SeedData;


// --------------------------------------------------------------------------- //
// Facilities / geofences across the Southern Ontario operating area.
// Expanded to cover every city referenced in the seed-data loads so that
// origin/destination city names map cleanly to geofenced Facility records.
// --------------------------------------------------------------------------- //
export const facilities: Facility[] = [
  // --- Hubs (non-billable yard dwell) ---
  { id: "FAC-LON-HUB", name: "London Distribution Hub", lat: 42.9849, lng: -81.2453, radius: 650, type: "HUB", address: "Exeter Rd & Wonderland Rd, London, ON", customer: "Internal" },
  { id: "FAC-MLT-HUB", name: "Milton Intermodal Hub", lat: 43.5182, lng: -79.8838, radius: 700, type: "HUB", address: "Steeles Ave & Thompson Rd, Milton, ON", customer: "Internal" },
  // --- Customer Docks (billable detention) ---
  { id: "FAC-MLT-DOCK", name: "Milton Customer Dock", lat: 43.5182, lng: -79.8838, radius: 350, type: "CUSTOMER_DOCK", address: "Steeles Ave E, Milton, ON", customer: "RONA Inc." },
  { id: "FAC-MSY-DOCK", name: "Mississauga Dixie Dock", lat: 43.595, lng: -79.64, radius: 350, type: "CUSTOMER_DOCK", address: "Dixie Rd, Mississauga, ON", customer: "Mondelez International" },
  { id: "FAC-TOR-DOCK", name: "Toronto East Dock", lat: 43.6532, lng: -79.3832, radius: 400, type: "CUSTOMER_DOCK", address: "Commissioners St, Toronto, ON", customer: "Electrolux" },
  { id: "FAC-CMB-DOCK", name: "Cambridge Customer Dock", lat: 43.3616, lng: -80.3146, radius: 320, type: "CUSTOMER_DOCK", address: "Hespeler Rd, Cambridge, ON", customer: "RONA Inc." },
  { id: "FAC-HAM-DOCK", name: "Hamilton Industrial Dock", lat: 43.2557, lng: -79.871, radius: 350, type: "CUSTOMER_DOCK", address: "Barton St E, Hamilton, ON", customer: "Steel City Logistics" },
  { id: "FAC-BRAM-DOCK", name: "Brampton Dock", lat: 43.728, lng: -79.7076, radius: 300, type: "CUSTOMER_DOCK", address: "Queen St E, Brampton, ON", customer: "Mondelez International" },
  { id: "FAC-WOOD-DOCK", name: "Woodbridge Dock", lat: 43.7879, lng: -79.6192, radius: 300, type: "CUSTOMER_DOCK", address: "Hwy 7, Woodbridge, ON", customer: "Electrolux" },
  { id: "FAC-AJX-DOCK", name: "Ajax Pickering Dock", lat: 43.85, lng: -79.03, radius: 300, type: "CUSTOMER_DOCK", address: "Westney Rd, Ajax, ON", customer: "Lakeshore Retail Group" },
  { id: "FAC-MARK-DOCK", name: "Markham Dock", lat: 43.8569, lng: -79.337, radius: 300, type: "CUSTOMER_DOCK", address: "Hwy 7, Markham, ON", customer: "RONA Inc." },
  { id: "FAC-OAK-DOCK", name: "Oakville Dock", lat: 43.4675, lng: -79.6877, radius: 300, type: "CUSTOMER_DOCK", address: "Trafalgar Rd, Oakville, ON", customer: "RONA Inc." },
  { id: "FAC-BURL-DOCK", name: "Burlington Dock", lat: 43.3255, lng: -79.799, radius: 300, type: "CUSTOMER_DOCK", address: "Fairview St, Burlington, ON", customer: "RONA Inc." },
  { id: "FAC-SCAR-DOCK", name: "Scarborough Dock", lat: 43.772, lng: -79.257, radius: 300, type: "CUSTOMER_DOCK", address: "Eglinton Ave E, Scarborough, ON", customer: "RONA Inc." },
  { id: "FAC-VAUG-DOCK", name: "Vaughan Dock", lat: 43.836, lng: -79.528, radius: 300, type: "CUSTOMER_DOCK", address: "Hwy 7, Vaughan, ON", customer: "RONA Inc." },
  // --- Terminals (billable detention) ---
  { id: "FAC-OSH-TERM", name: "Oshawa Terminal", lat: 43.8642, lng: -78.897, radius: 300, type: "TERMINAL", address: "Bloor St E, Oshawa, ON", customer: "Internal" },
  { id: "FAC-NIA-DOCK", name: "Niagara Falls Terminal", lat: 43.0962, lng: -79.0377, radius: 300, type: "TERMINAL", address: "Stanley Ave, Niagara Falls, ON", customer: "Border Cargo Inc." },
];

/** Map a raw seed-data city name to a facility ID. */
const CITY_FACILITY: Record<string, string> = {
  MILTON: "FAC-MLT-DOCK", MISSISSAUGA: "FAC-MSY-DOCK", BRAMPTON: "FAC-BRAM-DOCK",
  WOODBRIDGE: "FAC-WOOD-DOCK", AJAX: "FAC-AJX-DOCK", MARKHAM: "FAC-MARK-DOCK",
  HALTON_HILLS: "FAC-MLT-DOCK", OAKVILLE: "FAC-OAK-DOCK", BURLINGTON: "FAC-BURL-DOCK",
  HAGERSVILLE: "FAC-HAM-DOCK", SCARBOROUGH: "FAC-SCAR-DOCK", VAUGHAN: "FAC-VAUG-DOCK",
  TORONTO: "FAC-TOR-DOCK", CAMBRIDGE: "FAC-CMB-DOCK", HAMILTON: "FAC-HAM-DOCK",
  LONDON: "FAC-LON-HUB", OSHAWA: "FAC-OSH-TERM",
};
function cityToFacilityId(city: string): string {
  const key = city.toUpperCase().replace(/[\s-]+/g, "_");
  return CITY_FACILITY[key] ?? "FAC-MLT-DOCK";
}
// --------------------------------------------------------------------------- //
// Per-truck simulation scenario: origin/destination facilities, speed, and
// dock arrival offsets. Routes are fetched dynamically from OSRM at runtime
// (see buildTrucksWithRoadRoutes below) so trucks follow real road geometry
// automatically without hardcoded highway waypoints.
//
// B3339 is the LIVE DETENTION SHOWCASE truck: permanently DOCKED_WAITING at
// the Milton Customer Dock with a 150-minute-old arrival — just past the
// 120-minute free threshold so the detention alert fires and unbilled dollars
// tick live on screen.
// --------------------------------------------------------------------------- //

interface TruckScenario {
  status: TruckStatusType;
  origin_facility_id: string;
  destination_facility_id: string | null;
  progress: number; // 0-1 fraction of route already travelled at boot
  baseSpeed: number;
  startOdo: number;
  current_facility_id?: string | null;
  dock_arrival_offset_min?: number | null;
  assigned_load_id?: string | null;
  direction?: 1 | -1;
}

const TRUCK_SCENARIOS: Record<string, TruckScenario> = {
  // B3340 / Driver1 — In-Transit: Milton → Toronto East.
  B3340: { status: "IN_TRANSIT", origin_facility_id: "FAC-MLT-HUB", destination_facility_id: "FAC-TOR-DOCK", progress: 0.35, baseSpeed: 96, startOdo: 614250, direction: 1, assigned_load_id: "LD-408982-AA" },
  // B4602 / Driver2 — Off-Duty at Milton Hub yard.
  B4602: { status: "OFF_DUTY", origin_facility_id: "FAC-MLT-HUB", destination_facility_id: null, progress: 0, baseSpeed: 0, startOdo: 602980, current_facility_id: "FAC-MLT-HUB", assigned_load_id: null },
  // B4800 / Driver3 — In-Transit: Toronto → Milton (return leg).
  B4800: { status: "IN_TRANSIT", origin_facility_id: "FAC-TOR-DOCK", destination_facility_id: "FAC-MLT-HUB", progress: 0.25, baseSpeed: 94, startOdo: 590410, direction: 1, assigned_load_id: "LD-408982-AB" },
  // B1935 / Driver4 — In-Transit: Milton → Mississauga.
  B1935: { status: "IN_TRANSIT", origin_facility_id: "FAC-MLT-HUB", destination_facility_id: "FAC-MSY-DOCK", progress: 0.20, baseSpeed: 95, startOdo: 577330, direction: 1, assigned_load_id: "LD-409019" },
  // B3339 / Driver6 — DETENTION SHOWCASE: permanently Docked @ Milton (150 min → ALERT!).
  B3339: { status: "DOCKED_WAITING", origin_facility_id: "FAC-MSY-DOCK", destination_facility_id: "FAC-MLT-DOCK", progress: 0, baseSpeed: 0, startOdo: 602980, current_facility_id: "FAC-MLT-DOCK", dock_arrival_offset_min: 150, assigned_load_id: "LD-409014" },
  // B4505 / Driver7 — In-Transit: Mississauga → Oshawa.
  B4505: { status: "IN_TRANSIT", origin_facility_id: "FAC-MSY-DOCK", destination_facility_id: "FAC-OSH-TERM", progress: 0.30, baseSpeed: 98, startOdo: 631200, direction: 1, assigned_load_id: "LD-409021" },
  // B0610 / Driver10 — In-Transit: London → Milton (long corridor).
  B0610: { status: "IN_TRANSIT", origin_facility_id: "FAC-LON-HUB", destination_facility_id: "FAC-MLT-HUB", progress: 0.45, baseSpeed: 99, startOdo: 645000, direction: 1, assigned_load_id: "LD-409022" },
  // B9175 / Driver12 — In-Transit: Milton → Cambridge (backhaul eligible).
  B9175: { status: "IN_TRANSIT", origin_facility_id: "FAC-MLT-HUB", destination_facility_id: "FAC-CMB-DOCK", progress: 0.40, baseSpeed: 92, startOdo: 590000, direction: 1, assigned_load_id: null },
  // B5500 / Driver5 — Off-Duty at Milton Hub yard (available, 52.3h HOS).
  B5500: { status: "OFF_DUTY", origin_facility_id: "FAC-MLT-HUB", destination_facility_id: null, progress: 0, baseSpeed: 0, startOdo: 580000, current_facility_id: "FAC-MLT-HUB", assigned_load_id: null },
  // B8269 / Driver13 — In-Transit: Toronto → Oshawa (eastbound).
  B8269: { status: "IN_TRANSIT", origin_facility_id: "FAC-TOR-DOCK", destination_facility_id: "FAC-OSH-TERM", progress: 0.15, baseSpeed: 93, startOdo: 620500, direction: 1, assigned_load_id: "LD-409023" },
  // B5794 / Driver14 — In-Transit: Oshawa → Toronto (return leg).
  B5794: { status: "IN_TRANSIT", origin_facility_id: "FAC-OSH-TERM", destination_facility_id: "FAC-TOR-DOCK", progress: 0.25, baseSpeed: 90, startOdo: 580000, direction: 1, assigned_load_id: "LD-409024" },
};

const DEFAULT_SCENARIO: TruckScenario = {
  status: "IN_TRANSIT", origin_facility_id: "FAC-MLT-HUB",
  destination_facility_id: "FAC-MSY-DOCK", progress: 0, baseSpeed: 90,
  startOdo: 600000, direction: 1, assigned_load_id: null,
};

/** Look up a facility's [lat, lng] by ID. */
function facilityCoord(facId: string): [number, number] {
  const f = facilities.find((x) => x.id === facId);
  if (!f) return [43.5182, -79.8838]; // Milton fallback
  return [f.lat, f.lng];
}


/** Active fleet — 10 real trucks from the carrier TMS export.
 *  Initial sync render uses straight-line fallback routes; call
 *  buildTrucksWithRoadRoutes() on mount to swap in real OSRM road polylines. */
export const trucks: SimTruck[] = seed.trucks.map((st) => {
  const sc = TRUCK_SCENARIOS[st.truck_id] ?? DEFAULT_SCENARIO;
  return makeTruckFromScenario(st, sc);
});

/**
 * Async: fetch real OSRM road routes for all IN_TRANSIT trucks and return a
 * new SimTruck[] with road-following polylines. Cached by origin→destination
 * city pair so repeated mounts don't re-fetch.
 */
export async function buildTrucksWithRoadRoutes(): Promise<SimTruck[]> {
  // Collect unique origin→destination pairs that need OSRM routes.
  const routeSpecs: { origin: [number, number]; destination: [number, number]; cacheKey: string }[] = [];
  const seenKeys = new Set<string>();

  for (const st of seed.trucks) {
    const sc = TRUCK_SCENARIOS[st.truck_id] ?? DEFAULT_SCENARIO;
    if (sc.status !== "IN_TRANSIT" || !sc.destination_facility_id) continue;
    const origin = facilityCoord(sc.origin_facility_id);
    const dest = facilityCoord(sc.destination_facility_id);
    const cacheKey = `${sc.origin_facility_id}-${sc.destination_facility_id}`;
    if (!seenKeys.has(cacheKey)) {
      seenKeys.add(cacheKey);
      routeSpecs.push({ origin, destination: dest, cacheKey });
    }
  }

  // Fetch all unique routes in parallel (cached in memory + localStorage).
  const routeMap = await fetchAllRoadRoutes(routeSpecs);

  // Rebuild each truck with its OSRM polyline (or keep straight-line fallback).
  return seed.trucks.map((st) => {
    const sc = TRUCK_SCENARIOS[st.truck_id] ?? DEFAULT_SCENARIO;
    if (sc.status !== "IN_TRANSIT" || !sc.destination_facility_id) {
      return makeTruckFromScenario(st, sc);
    }
    const cacheKey = `${sc.origin_facility_id}-${sc.destination_facility_id}`;
    const roadRoute = routeMap[cacheKey];
    if (!roadRoute || roadRoute.length < 2) {
      return makeTruckFromScenario(st, sc);
    }
    return makeTruck({
      id: st.truck_id,
      truck_number: st.truck_id,
      driver_name: st.driver_name,
      routePoints: roadRoute,
      progressFrac: sc.progress,
      baseSpeed: sc.baseSpeed,
      startOdo: sc.startOdo,
      status: sc.status,
      origin_facility_id: sc.origin_facility_id,
      destination_facility_id: sc.destination_facility_id,
      current_facility_id: sc.current_facility_id,
      dock_arrival_offset_min: sc.dock_arrival_offset_min,
      assigned_load_id: sc.assigned_load_id,
      hos_remaining_hours: st.hos_remaining_hours,
      direction: sc.direction,
    });
  });
}


// Reverse lookup: load_id → truck_id (built from the scenario assignments).
const LOAD_TRUCK_MAP: Record<string, string> = {};
for (const [truckId, sc] of Object.entries(TRUCK_SCENARIOS)) {
  if (sc.assigned_load_id) LOAD_TRUCK_MAP[sc.assigned_load_id] = truckId;
}

const LBS_TO_KG = 1 / 2.20462;

/** 15 real Ontario regional loads from the carrier TMS Tlorder export. */
export const loads: Load[] = seed.loads.map((sl, i) => {
  const id = `LD-${sl.bill_number}`;
  const truckId = LOAD_TRUCK_MAP[id] ?? null;
  return {
    id,
    truck_id: truckId,
    customer: sl.customer,
    origin_facility_id: cityToFacilityId(sl.origin),
    destination_facility_id: cityToFacilityId(sl.destination),
    commodity: sl.load_description,
    weight_kg: Math.round(sl.weight_lbs * LBS_TO_KG),
    pickup_time: iso(180 - i * 15),
    status: truckId ? "IN_TRANSIT" : "PENDING",
    bill_number: sl.bill_number,
    origin_city: sl.origin,
    destination_city: sl.destination,
    load_type: sl.load_type,
    weight_lbs: sl.weight_lbs,
    pallets: sl.pallets,
    temp_controlled: sl.temp_controlled,
    temperature: sl.temperature,
    // First 2 loads have urgent expiring appointment windows (38m and 52m remaining).
    delivery_appointment_window: i < 2
      ? new Date(NOW + (i === 0 ? 38 : 52) * 60000).toISOString()
      : undefined,
    is_urgent_expiring: i < 2,
  };
});

// Driver name → truck_id lookup (for mapping seed detention events to trucks).
const DRIVER_TRUCK_MAP: Record<string, string> = {};
for (const st of seed.trucks) {
  DRIVER_TRUCK_MAP[st.driver_name] = st.truck_id;
}

/** Map a seed detention zone (e.g. "MILTON,ON") to a facility ID. */
function zoneToFacilityId(zone: string): string {
  const city = zone.split(",")[0].trim();
  return cityToFacilityId(city);
}

/** 30 closed detention sessions mined from the carrier Dispatch export —
 *  feeds the MTD billed total in the header. */
export const closedDetentionLogs: DetentionLog[] = seed.detention_events.map(
  (e) => ({
    id: e.session_id,
    load_id: `LD-${e.freight}`,
    truck_id: DRIVER_TRUCK_MAP[e.driver_name] ?? e.driver_name,
    facility_id: zoneToFacilityId(e.origin_zone),
    arrival_time: e.pickup_arrival,
    departure_time: e.delivery_arrival,
    total_dock_minutes: e.dock_minutes,
    billable_detention_minutes: e.billable_detention_minutes,
    detention_fee_owed: e.detention_fee_owed,
    status: "CLOSED",
  }),
);

/** Lookup helpers. */
export const facilityMap = new Map(facilities.map((f) => [f.id, f]));
export const getFacility = (id: string | null | undefined) =>
  id ? facilityMap.get(id) : undefined;
export const loadMap = new Map(loads.map((l) => [l.id, l]));
export const getLoad = (id: string | null | undefined) =>
  id ? loadMap.get(id) : undefined;
