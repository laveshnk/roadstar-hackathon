import type { LatLng } from "./types";

const R = 6371; // Earth radius in km
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance between two points in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing (degrees, 0-360) from a to b. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Densify a list of waypoints into a smooth polyline by linearly
 * interpolating `perSegment` sub-points between each consecutive pair.
 */
export function interpolateRoute(waypoints: LatLng[], perSegment = 3): LatLng[] {
  if (waypoints.length === 0) return [];
  if (waypoints.length === 1) return [waypoints[0]];
  const pts: LatLng[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment;
      pts.push({ lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t) });
    }
  }
  pts.push(waypoints[waypoints.length - 1]);
  return pts;
}

/**
 * Southern Ontario highway corridor polylines.
 *
 * These are multi-point waypoints that hug the actual alignment of Highway
 * 401, Highway 403, and the QEW through the GTA so that interpolated truck
 * routes and cyan breadcrumb trails bend along real highway geometry instead
 * of cutting straight diagonal lines across the map.
 *
 * Coordinates are approximated from the real road alignment at ~5-10 km
 * intervals — sufficient resolution for a zoom-8/10 dispatcher map.
 */

/** Highway 401 corridor: London → Milton → Mississauga → Toronto → Oshawa. */
export const HWY_401: LatLng[] = [
  { lat: 42.9849, lng: -81.2453 }, // London
  { lat: 43.032, lng: -80.992 }, // Hwy 401 E of London
  { lat: 43.082, lng: -80.742 }, // Woodstock area
  { lat: 43.128, lng: -80.502 }, // Ingersoll / 401
  { lat: 43.166, lng: -80.246 }, // E of Ingersoll
  { lat: 43.218, lng: -79.998 }, // Hwy 403 junction (Cambridge SW)
  { lat: 43.301, lng: -80.316 }, // Cambridge / Hespeler Rd
  { lat: 43.382, lng: -80.138 }, // 401 E of Cambridge
  { lat: 43.448, lng: -79.998 }, // 401 at Milton (Steeles)
  { lat: 43.518, lng: -79.884 }, // Milton Intermodal
  { lat: 43.552, lng: -79.798 }, // 401 at Trafalgar Rd
  { lat: 43.606, lng: -79.742 }, // Meadowvale / 401
  { lat: 43.643, lng: -79.688 }, // 401 at Winston Churchill
  { lat: 43.665, lng: -79.642 }, // 401 / 403 interchange (Mississauga)
  { lat: 43.682, lng: -79.612 }, // 401 past Pearson Airport
  { lat: 43.684, lng: -79.575 }, // 401 / 427 interchange
  { lat: 43.705, lng: -79.522 }, // 401 at Islington Ave
  { lat: 43.731, lng: -79.462 }, // 401 at Dufferin St
  { lat: 43.761, lng: -79.412 }, // 401 across North York
  { lat: 43.775, lng: -79.255 }, // Toronto East Dock / 401 @ Don Valley
  { lat: 43.802, lng: -79.142 }, // 401 at Kennedy Rd (Scarborough)
  { lat: 43.824, lng: -79.046 }, // 401 at Pickering
  { lat: 43.846, lng: -78.946 }, // 401 at Ajax
  { lat: 43.864, lng: -78.897 }, // Oshawa Terminal
];

/** Highway 403 corridor: Hamilton → Mississauga (joins 401 at the 401/403 junction). */
export const HWY_403: LatLng[] = [
  { lat: 43.2557, lng: -79.871 }, // Hamilton
  { lat: 43.232, lng: -79.831 }, // 403 E of Hamilton
  { lat: 43.262, lng: -79.778 }, // 403 at Waterdown
  { lat: 43.298, lng: -79.738 }, // 403 at Burlington
  { lat: 43.361, lng: -79.752 }, // 403 / QEW junction
  { lat: 43.428, lng: -79.712 }, // 403 at Oakville
  { lat: 43.502, lng: -79.688 }, // 403 N of Oakville
  { lat: 43.568, lng: -79.672 }, // 403 at Dundas St
  { lat: 43.628, lng: -79.658 }, // 403 / 401 junction (Mississauga)
  { lat: 43.665, lng: -79.642 }, // merges into 401 E
];

/** QEW corridor: Niagara Falls → Burlington (joins 403). */
export const QEW: LatLng[] = [
  { lat: 43.0962, lng: -79.0377 }, // Niagara Falls
  { lat: 43.082, lng: -79.108 }, // QEW W of Niagara
  { lat: 43.052, lng: -79.242 }, // St. Catharines
  { lat: 43.046, lng: -79.372 }, // QEW at Grimsby
  { lat: 43.078, lng: -79.508 }, // QEW at Beamsville
  { lat: 43.138, lng: -79.612 }, // QEW at Vineland
  { lat: 43.178, lng: -79.688 }, // QEW at Stoney Creek
  { lat: 43.242, lng: -79.798 }, // QEW at Burlington
  { lat: 43.301, lng: -79.752 }, // QEW / 403 junction
];

/**
 * Extract a sub-segment of a corridor between two waypoint indices
 * (inclusive), then interpolate it for smooth rendering.
 */
export function sliceRoute(
  corridor: LatLng[],
  fromIdx: number,
  toIdx: number,
  perSegment = 5,
): LatLng[] {
  if (corridor.length === 0) return [];
  const lo = Math.max(0, Math.min(fromIdx, toIdx));
  const hi = Math.min(corridor.length - 1, Math.max(fromIdx, toIdx));
  const slice = corridor.slice(lo, hi + 1);
  const segs = interpolateRoute(slice, perSegment);
  // Preserve direction: if fromIdx > toIdx the segment is reversed.
  return fromIdx > toIdx ? segs.reverse() : segs;
}

/** Total path length (km) across an ordered list of points. */
export function routeLengthKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString("en-CA")} km`;
}

export function formatSpeed(kmh: number): string {
  return `${Math.round(kmh)} km/h`;
}

export function formatHeading(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return `${Math.round(deg)}° ${dirs[idx]}`;
}

// --------------------------------------------------------------------------- //
// OSRM road routing (free, keyless public API)
// --------------------------------------------------------------------------- //

/**
 * Fetch a real-world driving route from the free public OSRM (Open Source
 * Routing Machine) car routing endpoint.
 *
 * API: https://router.project-osrm.org/route/v1/driving/{lon,lat};{lon,lat}
 *      ?overview=full&geometries=geojson
 *
 * OSRM returns coordinates as [lon, lat]; we flip them to Leaflet [lat, lng].
 *
 * Results are cached in-memory AND in localStorage by origin→destination key
 * so repeated trips don't hit the public server or rate limits. If the fetch
 * fails or times out, we fall back to straight-line interpolation.
 */

/** In-memory cache of fetched road route polylines, keyed by "originCity-destCity". */
const routeCache = new Map<string, LatLng[]>();

/** Fetch timeout for OSRM requests (ms). */
const OSRM_TIMEOUT_MS = 8000;

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

/** Build the OSRM URL for a single origin → destination driving route. */
function osrmUrl(origin: [number, number], destination: [number, number]): string {
  // OSRM expects: {lon,lat};{lon,lat}
  const coords = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`;
  return `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;
}

/** Read a cached route from localStorage (browser only). */
function readLocalCache(key: string): LatLng[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`osrm-route:${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as LatLng[];
  } catch {
    return null;
  }
}

/** Write a route to localStorage (browser only). */
function writeLocalCache(key: string, route: LatLng[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`osrm-route:${key}`, JSON.stringify(route));
  } catch {
    // localStorage might be full or disabled — silently ignore.
  }
}

/** Straight-line fallback: densify a simple A→B line. */
export function straightLine(
  origin: [number, number],
  destination: [number, number],
  perSegment = 20,
): LatLng[] {
  return interpolateRoute(
    [
      { lat: origin[0], lng: origin[1] },
      { lat: destination[0], lng: destination[1] },
    ],
    perSegment,
  );
}

/**
 * Fetch a real road route polyline from OSRM.
 *
 * @param origin      [lat, lng] of the origin facility.
 * @param destination [lat, lng] of the destination facility.
 * @param cacheKey    Optional cache key (e.g. "MILTON-TORONTO"). When provided,
 *                    results are cached in memory + localStorage by this key.
 * @returns           Array of LatLng points following real roads, or a
 *                    straight-line fallback if the fetch fails.
 */
export async function fetchRoadRoute(
  origin: [number, number],
  destination: [number, number],
  cacheKey?: string,
): Promise<LatLng[]> {
  // 1. Check in-memory cache.
  if (cacheKey && routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }
  // 2. Check localStorage cache.
  if (cacheKey) {
    const local = readLocalCache(cacheKey);
    if (local && local.length > 1) {
      routeCache.set(cacheKey, local);
      return local;
    }
  }

  // 3. Fetch from OSRM.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

    const res = await fetch(osrmUrl(origin, destination), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      throw new Error("OSRM returned no geometry");
    }

    // Flip [lon, lat] → [lat, lng] (Leaflet format).
    const route: LatLng[] = coords.map(
      (c: [number, number]) => ({ lat: c[1], lng: c[0] }),
    );

    // Cache it.
    if (cacheKey) {
      routeCache.set(cacheKey, route);
      writeLocalCache(cacheKey, route);
    }

    return route;
  } catch {
    // 4. Fallback to straight-line interpolation.
    return straightLine(origin, destination);
  }
}

/** Preload multiple road routes in parallel (used on dashboard boot). */
export async function fetchAllRoadRoutes(
  routes: { origin: [number, number]; destination: [number, number]; cacheKey: string }[],
): Promise<Record<string, LatLng[]>> {
  const entries = await Promise.all(
    routes.map(async (r) => ({
      key: r.cacheKey,
      route: await fetchRoadRoute(r.origin, r.destination, r.cacheKey),
    })),
  );
  const result: Record<string, LatLng[]> = {};
  for (const e of entries) result[e.key] = e.route;
  return result;
}
