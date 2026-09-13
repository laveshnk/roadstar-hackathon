"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConnectionStatus,
  DispatchEvent,
  DispatchOfferData,
  SnapshotData,
  TelemetryData,
  TruckSnapshot,
} from "@/lib/types";

const WS_URL = "ws://localhost:4001";
const REST_SNAPSHOT_URL = "http://localhost:4001/api/fleet/snapshot";
const REST_RELAY_URL = "http://localhost:4001/api/relay";
const RECONNECT_DELAY_MS = 5000;

export interface FleetSocketState {
  status: ConnectionStatus;
  /** Trucks populated from the live backend snapshot/telemetry (empty when disconnected). */
  liveTrucks: TruckSnapshot[];
  /** Latest geofence event (for toast notifications). */
  lastGeofenceEvent: { event_type: "GEOFENCE_ENTER" | "GEOFENCE_EXIT"; truck_id: string; facility_id: string; facility_name: string; lat: number; lng: number; timestamp: string } | null;
  /** Latest dispatch handshake event (accepted/rejected/delay from the driver app). */
  lastDispatchEvent: DispatchEvent | null;
  /** Send a dispatch offer to the driver app via the WS message broker. */
  sendDispatchOffer: (offer: DispatchOfferData) => void;
  /** Manually trigger a reconnect attempt. */
  reconnect: () => void;
}

/**
 * Strict backend connectivity hook.
 *
 * On mount, attempts to:
 *  1. Fetch the initial REST snapshot from GET http://localhost:4001/api/fleet/snapshot
 *  2. Connect to the WebSocket at ws://localhost:4001
 *
 * When connected, populates `liveTrucks` from SNAPSHOT and TELEMETRY_UPDATE events.
 * When disconnected, `liveTrucks` is empty and `status` is "DISCONNECTED".
 *
 * Auto-reconnects every RECONNECT_DELAY_MS when the socket drops.
 */
export function useFleetSocket(): FleetSocketState {
  const [status, setStatus] = useState<ConnectionStatus>("CONNECTING");
  const [liveTrucks, setLiveTrucks] = useState<TruckSnapshot[]>([]);
  const [lastGeofenceEvent, setLastGeofenceEvent] = useState<FleetSocketState["lastGeofenceEvent"]>(null);
  const [lastDispatchEvent, setLastDispatchEvent] = useState<DispatchEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to break the self-reference cycle in the reconnect callback.
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    // Clean up any existing connection.
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      try { wsRef.current.close(); } catch { /* noop */ }
      wsRef.current = null;
    }

    setStatus("CONNECTING");

    // Step 1: Try REST snapshot first (gives us truck data even before WS connects).
    fetch(REST_SNAPSHOT_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SnapshotData>;
      })
      .then((snap) => {
        setLiveTrucks(snap.trucks);
        setStatus("CONNECTED");
      })
      .catch(() => {
        // REST failed — WS will be the fallback.
      });

    // Step 2: Connect WebSocket for live telemetry + dispatch events.
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("CONNECTED");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          // Handle simulation engine events.
          switch (msg.type as string) {
            case "SNAPSHOT": {
              const data = msg.data as SnapshotData;
              setLiveTrucks(data.trucks);
              setStatus("CONNECTED");
              break;
            }
            case "TELEMETRY_UPDATE": {
              const t = msg.data as TelemetryData;
              setLiveTrucks((prev) =>
                prev.map((truck) =>
                  truck.truck_id === t.truck_id
                    ? { ...truck, lat: t.lat, lng: t.lng, speed_kmh: t.speed_kmh, odometer_km: t.odometer_km, heading: t.heading, duty_status: t.duty_status, hos_drive_remaining_min: t.hos_drive_remaining_min, hos_duty_remaining_min: t.hos_duty_remaining_min, timestamp: t.timestamp }
                    : truck,
                ),
              );
              break;
            }
            case "GEOFENCE_EVENT": {
              setLastGeofenceEvent(msg.data);
              const geodata = msg.data;
              setLiveTrucks((prev) =>
                prev.map((truck) => {
                  if (truck.truck_id !== geodata.truck_id) return truck;
                  if (geodata.event_type === "GEOFENCE_ENTER") {
                    return { ...truck, current_facility_id: geodata.facility_id, facility_name: geodata.facility_name, dock_arrival_time: geodata.timestamp, duty_status: "DOCKED_WAITING" as const };
                  }
                  return { ...truck, current_facility_id: null, facility_name: null, dock_arrival_time: null, duty_status: "DRIVING" as const };
                }),
              );
              break;
            }
            // Cross-origin dispatch handshake events (relayed by the WS broker).
            case "DISPATCH_ACCEPTED":
            case "DISPATCH_REJECTED":
            case "DRIVER_DELAY":
            case "INCIDENT_REPORT": {
              setLastDispatchEvent(msg as DispatchEvent);
              break;
            }
            default:
              break;
          }
        } catch {
          // Malformed JSON — ignore.
        }
      };

      ws.onclose = () => {
        setStatus("DISCONNECTED");
        wsRef.current = null;
        // Auto-reconnect via ref (breaks the self-reference cycle).
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => connectRef.current(), RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        try { ws.close(); } catch { /* noop */ }
      };
    } catch {
      setStatus("DISCONNECTED");
    }
  }, []);

  // Keep the ref in sync so the reconnect callback always calls the latest connect.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  /** Send a dispatch offer to the driver app via the WS message broker + localStorage fallback. */
  const sendDispatchOffer = useCallback((offer: DispatchOfferData) => {
    const event: DispatchEvent = { type: "DISPATCH_OFFER", data: offer };
    const msg = JSON.stringify(event);
    // Primary: send via WebSocket.
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(msg); } catch { /* noop */ }
    }
    // Fallback 1: POST to the REST relay endpoint (works when WS is down).
    if (typeof fetch !== "undefined") {
      fetch(REST_RELAY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: msg }).catch(() => {});
    }
    // Fallback 2: localStorage window storage event — works even when the
    // simulation engine is completely offline. The driver app (on port 5174)
    // listens for `storage` events on this key.
    if (typeof localStorage !== "undefined") {
      try { localStorage.setItem("apex_dispatch_offer", msg); } catch { /* noop */ }
    }
  }, []);

  // Connect on mount, cleanup on unmount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect();

    // Fallback: listen for localStorage storage events from the driver app.
    // The driver app writes DISPATCH_ACCEPTED/REJECTED to "apex_dispatch_response".
    // storage events fire cross-tab/window but not in the same tab.
    const storageHandler = (e: StorageEvent) => {
      if (e.key !== "apex_dispatch_response" || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as DispatchEvent;
        if (msg.type === "DISPATCH_ACCEPTED" || msg.type === "DISPATCH_REJECTED" || msg.type === "DRIVER_DELAY" || msg.type === "INCIDENT_REPORT") {
          setLastDispatchEvent(msg);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", storageHandler);

    return () => {
      window.removeEventListener("storage", storageHandler);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        try { wsRef.current.close(); } catch { /* noop */ }
      }
    };
  }, [connect]);

  return { status, liveTrucks, lastGeofenceEvent, lastDispatchEvent, sendDispatchOffer, reconnect: connect };
}
