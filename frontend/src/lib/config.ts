/**
 * Central configuration & domain constants for the Web Dispatcher Dashboard.
 * Apex Corridor Systems regional dispatch platform.
 */

/** Free dock time allowance in FTL freight (2 hours = 120 minutes). */
export const FREE_DETENTION_MINUTES = 120;

/** Detention billing rate in CAD per hour (prorated per minute). */
export const DETENTION_RATE_PER_HOUR = 75;

/** Currency label for display. */
export const CURRENCY = "CAD";

/** Live clock refresh interval (ms). */
export const CLOCK_INTERVAL_MS = 1000;

/** Fleet movement refresh interval (ms). */
export const MOVEMENT_INTERVAL_MS = 2000;

/** Time warp multiplier — accelerates truck movement so it's visible at
 *  regional zoom levels. At 1x, a truck at 90 km/h moves ~50m per 2s tick
 *  (invisible). At 60x, it moves ~3km per tick (clearly visible). */
export const TIME_WARP_FACTOR = 60;

/** Minutes assumed between plotted breadcrumb points (for synthetic timestamps). */
export const BREADCRUMB_STEP_MINUTES = 6;

/** Max breadcrumb points retained per truck. */
export const MAX_BREADCRUMB_POINTS = 80;

/**
 * Southern Ontario operating bounding box.
 * Barrie (N), Niagara Falls (S), London (W), Peterborough/Pickering (E).
 */
export const SOUTHERN_ONTARIO_BOUNDS: [[number, number], [number, number]] = [
  [44.55, -81.55], // north-west (Barrie / London area)
  [42.9, -78.0], // south-east (Niagara / Peterborough area)
];

export const MAP_CENTER: [number, number] = [43.45, -79.95];
export const MAP_DEFAULT_ZOOM = 8;

/** Map tile sources (key-free for hackathon portability). */
export const TILE_SOURCES = {
  street: {
    // 100% free, keyless OpenStreetMap standard raster tiles (no watermark).
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: "abc",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
    subdomains: "",
  },
  labels: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    attribution: "Labels &copy; Esri",
    maxZoom: 19,
    subdomains: "",
  },
} as const;

export type MapStyle = "street" | "satellite";
