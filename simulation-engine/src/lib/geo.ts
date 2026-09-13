import type { LatLng } from "../types.js";

const R = 6371000; // Earth radius (metres)
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance between two points in metres. */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function haversineKm(a: LatLng, b: LatLng): number {
  return haversineMetres(a, b) / 1000;
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
 * Densify a waypoint list into a smooth polyline by inserting `perSegment`
 * interpolated sub-points between each consecutive pair (good for telemetry
 * granularity along the 401/403 corridors).
 */
export function densify(waypoints: LatLng[], perSegment = 8): LatLng[] {
  if (waypoints.length < 2) return [...waypoints];
  const out: LatLng[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment;
      out.push({ lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t) });
    }
  }
  out.push(waypoints[waypoints.length - 1]);
  return out;
}

/** True when `point` lies within `radiusMetres` of `center`. */
export function pointInCircle(
  center: LatLng,
  radiusMetres: number,
  point: LatLng,
): boolean {
  return haversineMetres(center, point) <= radiusMetres;
}
