import type { IncomingMessage, ServerResponse } from "http";
import type { SnapshotData } from "../types.js";

/**
 * In-memory event relay store for the REST fallback channel.
 *
 * When the WebSocket connection is unavailable (e.g. simulation engine
 * temporarily down), the dispatcher dashboard and driver ELD app can fall
 * back to polling this REST endpoint. Events are kept in a ring buffer for
 * a short window so late-connecting clients can catch up.
 */
const RELAY_MAX_EVENTS = 200;
const relayEvents: Array<{ id: number; data: string }> = [];
let relayNextId = 1;

function pushRelayEvent(raw: string): void {
  relayEvents.push({ id: relayNextId++, data: raw });
  if (relayEvents.length > RELAY_MAX_EVENTS) relayEvents.shift();
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
  });
}

/**
 * Minimal HTTP handler for the fleet snapshot endpoint + dispatch event relay.
 * CORS is enabled so the dashboard (localhost:3000) and driver app
 * (localhost:5174) can interact directly.
 */
export function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  getSnapshot: () => SnapshotData,
): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = (req.url ?? "").split("?")[0];

  // --- Fleet snapshot (GET) ---
  if (req.method === "GET" && path === "/api/fleet/snapshot") {
    const snap = getSnapshot();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(snap));
    return;
  }

  // --- Driver event ingest (POST) — legacy endpoint kept for compatibility ---
  if (req.method === "POST" && path === "/api/driver-event") {
    readBody(req).then((body) => {
      if (body) pushRelayEvent(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // --- Dispatch event relay: POST stores, GET retrieves ---
  if (req.method === "POST" && path === "/api/relay") {
    readBody(req).then((body) => {
      if (body) pushRelayEvent(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, id: relayNextId - 1 }));
    });
    return;
  }

  if (req.method === "GET" && path === "/api/events") {
    const query = new URLSearchParams((req.url ?? "").split("?")[1] ?? "");
    const since = parseInt(query.get("since") ?? "0", 10);
    const events = relayEvents.filter((e) => e.id > since);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ events, latestId: relayNextId - 1 }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found", path }));
}
