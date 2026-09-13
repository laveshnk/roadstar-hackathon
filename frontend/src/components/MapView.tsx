"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Facility } from "@/lib/types";
import type { SimTruck } from "@/lib/mockData";
import {
  MAP_CENTER,
  MAP_DEFAULT_ZOOM,
  TILE_SOURCES,
  type MapStyle,
} from "@/lib/config";
import { FACILITY_META, STATUS_META } from "@/lib/ui";
import { formatSpeed } from "@/lib/geo";

/** Build a coloured div-icon marker for a truck (pulses when in-transit). */
function buildTruckIcon(truck: SimTruck, selected: boolean) {
  const color = STATUS_META[truck.current_status].marker;
  const pulse = truck.current_status === "IN_TRANSIT";
  const html = `
    <div class="truck-pin ${selected ? "truck-pin--selected" : ""}">
      ${pulse ? `<span class="truck-pin__pulse" style="border-color:${color}"></span>` : ""}
      <div class="truck-pin__dot" style="background:${color}"></div>
      <div class="truck-pin__label">${truck.truck_number}</div>
    </div>`;
  return L.divIcon({
    html,
    className: "truck-divicon",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

/** Imperatively update marker positions without unmounting/remounting.
 *  React-Leaflet's Marker doesn't always re-render when only the position
 *  prop changes — this component uses the Leaflet API directly to move the
 *  marker to the updated lat/lng on every render. */
function TruckMarker({
  truck,
  selected,
  tick,
  onSelect,
}: {
  truck: SimTruck;
  selected: boolean;
  tick: number;
  onSelect: (id: string) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  // Imperatively update the marker position + icon. The `tick` prop ensures
  // this effect re-runs every movement interval even if React batches renders.
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng([truck.lat, truck.lng]);
      markerRef.current.setIcon(buildTruckIcon(truck, selected));
    }
  }, [truck, selected, tick]);
  return (
    <Marker
      ref={markerRef}
      position={[truck.lat, truck.lng]}
      icon={buildTruckIcon(truck, selected)}
      eventHandlers={{ click: () => onSelect(truck.id) }}
      zIndexOffset={selected ? 1000 : 0}
    >
      <Popup>
        <div className="space-y-0.5">
          <div className="font-semibold">Truck {truck.truck_number}</div>
          <div className="text-zinc-400">{truck.driver_name}</div>
          <div className="text-zinc-500">
            {STATUS_META[truck.current_status].label} · {formatSpeed(truck.speed)}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

/** Fly the map to a truck whenever the selection changes. */
function FlyToController({ truck }: { truck: SimTruck | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (truck) map.flyTo([truck.lat, truck.lng], 12, { duration: 1.2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truck?.id]);
  return null;
}

export default function MapView({
  facilities,
  trucks,
  selectedTruckId,
  mapStyle,
  onToggleStyle,
  onSelectTruck,
  tick,
}: {
  facilities: Facility[];
  trucks: SimTruck[];
  selectedTruckId: string | null;
  mapStyle: MapStyle;
  onToggleStyle: () => void;
  onSelectTruck: (id: string) => void;
  /** Incremented every movement tick to force marker position re-renders. */
  tick?: number;
}) {
  const baseTile = TILE_SOURCES[mapStyle];
  const labelsTile = TILE_SOURCES.labels;
  const selectedTruck = trucks.find((t) => t.id === selectedTruckId);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={MAP_CENTER}
        zoom={MAP_DEFAULT_ZOOM}
        minZoom={4}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          key={mapStyle}
          url={baseTile.url}
          attribution={baseTile.attribution}
          maxZoom={baseTile.maxZoom}
        />
        {mapStyle === "satellite" && (
          <TileLayer
            url={labelsTile.url}
            attribution={labelsTile.attribution}
            maxZoom={labelsTile.maxZoom}
            opacity={0.9}
          />
        )}

        <FlyToController truck={selectedTruck} />

        {/* Facility geofences */}
        {facilities.map((f) => {
          const meta = FACILITY_META[f.type];
          return (
            <Circle
              key={f.id}
              center={[f.lat, f.lng]}
              radius={f.radius}
              pathOptions={{
                color: meta.color,
                fillColor: meta.fill,
                fillOpacity: 0.12,
                weight: 1.5,
              }}
            >
              <Tooltip direction="top">{f.name}</Tooltip>
              <Popup>
                <div className="space-y-0.5">
                  <div className="font-semibold">{f.name}</div>
                  <div className="text-zinc-400">
                    {meta.label} · {f.customer}
                  </div>
                  <div className="text-zinc-500">{f.address}</div>
                  <div className="text-zinc-500">
                    Geofence radius: {f.radius} m
                  </div>
                </div>
              </Popup>
            </Circle>
          );
        })}

        {/* Truck markers — stable keys, imperative position updates via TruckMarker */}
        {trucks.map((t) => (
          <TruckMarker
            key={t.id}
            truck={t}
            selected={t.id === selectedTruckId}
            tick={tick ?? 0}
            onSelect={onSelectTruck}
          />
        ))}

        {/* Selected truck: traveled breadcrumb (solid) + planned route (dashed) */}
        {selectedTruck && (selectedTruck.breadcrumb?.length ?? 0) > 1 && (
          <Polyline
            positions={selectedTruck.breadcrumb.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: "#38bdf8", weight: 4, opacity: 0.85 }}
          />
        )}
        {selectedTruck &&
          (selectedTruck.routePoints?.length ?? 0) > Math.floor(selectedTruck.progress ?? 0) + 1 && (
            <Polyline
              positions={selectedTruck.routePoints
                .slice(Math.floor(selectedTruck.progress ?? 0))
                .map((p) => [p.lat, p.lng])}
              pathOptions={{
                color: "#64748b",
                weight: 2,
                opacity: 0.6,
                dashArray: "6 8",
              }}
            />
          )}
      </MapContainer>

      <button
        type="button"
        onClick={onToggleStyle}
        title="Toggle Satellite / Street view"
        className="absolute right-3 top-3 z-[1000] flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-lg backdrop-blur hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1E293B]/90 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
          <path d="M3 17l9 5 9-5" />
        </svg>
        {mapStyle === "satellite" ? "Street" : "Satellite"}
      </button>
    </div>
  );
}
