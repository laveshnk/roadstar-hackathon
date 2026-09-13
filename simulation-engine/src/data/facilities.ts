import type { Facility } from "../types.js";

/**
 * Geofenced facilities across the Southern Ontario operating corridor
 * (Hwy 401 / 403 / QEW). The Mississauga Dixie Dock id matches the spec's
 * geofence-event example exactly.
 */
export const facilities: Facility[] = [
  {
    id: "FAC-LONDON-TERMINAL",
    name: "London Terminal",
    lat: 42.9849,
    lng: -81.2453,
    radius: 650,
    type: "HUB",
  },
  {
    id: "FAC-MILTON-HUB",
    name: "Milton Intermodal Hub",
    lat: 43.5182,
    lng: -79.8838,
    radius: 700,
    type: "HUB",
  },
  {
    id: "FAC-CAMBRIDGE-DOCK",
    name: "Cambridge Customer Dock",
    lat: 43.3616,
    lng: -80.3146,
    radius: 500,
    type: "CUSTOMER_DOCK",
  },
  {
    id: "FAC-MISSISSAUGA-DIXIE",
    name: "Mississauga Dixie Dock",
    lat: 43.6315,
    lng: -79.6082,
    radius: 500,
    type: "CUSTOMER_DOCK",
  },
  {
    id: "FAC-TORONTO-EAST",
    name: "Toronto East Dock",
    lat: 43.6532,
    lng: -79.3832,
    radius: 500,
    type: "CUSTOMER_DOCK",
  },
];

export const facilityMap = new Map(facilities.map((f) => [f.id, f]));
