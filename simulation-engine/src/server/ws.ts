import type { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import type { ServerEvent, SnapshotData } from "../types.js";

export interface FleetSocketServer {
  wss: WebSocketServer;
  broadcast: (event: ServerEvent) => void;
}

/**
 * Attach a WebSocket server to an existing HTTP server.
 *
 * On every new connection, an initial SNAPSHOT is pushed immediately.
 * `broadcast()` fans telemetry & geofence events out to all open clients.
 *
 * Additionally acts as a message broker: any message received from a client
 * (e.g. DISPATCH_OFFER, DISPATCH_ACCEPTED, DISPATCH_REJECTED, INCIDENT_REPORT)
 * is relayed to all other connected clients. This enables cross-origin
 * communication between the dispatcher dashboard (port 3000) and the driver
 * ELD app (port 5174) through the shared WebSocket on port 4001.
 */
export function createFleetServer(
  server: Server,
  getSnapshot: () => SnapshotData,
): FleetSocketServer {
  const wss = new WebSocketServer({ server, path: "/" });

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "SNAPSHOT", data: getSnapshot() }));

    // Relay incoming client messages to all OTHER connected clients.
    // This is the cross-origin message bus for dispatch handshakes.
    ws.on("message", (data, isBinary) => {
      if (isBinary) return; // Only relay text (JSON) messages.
      const msg = data.toString();
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    });
  });

  // Keep connections alive through proxies / idle timeouts.
  const pingInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(pingInterval));

  const broadcast = (event: ServerEvent): void => {
    const msg = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  };

  return { wss, broadcast };
}
