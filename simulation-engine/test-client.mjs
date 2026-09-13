// Quick smoke client: connects to the running engine, logs the initial
// snapshot, then counts/logs live telemetry & geofence events for 18s.
// Usage: node test-client.mjs   (run after `npm run dev`)
import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:4001");
let telemetry = 0;
let geofence = 0;
const slowSpeeds = [];

ws.on("open", () => console.log("[client] connected to ws://localhost:4001"));

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "SNAPSHOT") {
    console.log(
      `[client] SNAPSHOT: ${msg.data.trucks.length} trucks, warp ${msg.data.time_warp_factor}x`,
    );
    for (const t of msg.data.trucks) {
      const det =
        t.billable_detention_minutes > 0
          ? `  DETENTION +${t.billable_detention_minutes}m $${t.detention_fee_owed}`
          : "";
      console.log(
        `   ${t.truck_id} ${t.driver_name} ${t.duty_status} ${t.speed_kmh}km/h dock=${t.dock_wait_minutes}m${det}`,
      );
    }
  } else if (msg.type === "TELEMETRY_UPDATE") {
    telemetry++;
    if (msg.data.truck_id === "TRK-1003" && msg.data.speed_kmh < 25) {
      slowSpeeds.push(msg.data.speed_kmh);
    }
    if (telemetry <= 3 || telemetry % 10 === 0) {
      console.log(
        `[client] TELEMETRY #${telemetry}: ${msg.data.truck_id} ${msg.data.speed_kmh}km/h @ ${msg.data.lat.toFixed(4)},${msg.data.lng.toFixed(4)} [${msg.data.duty_status}]`,
      );
    }
  } else if (msg.type === "GEOFENCE_EVENT") {
    geofence++;
    console.log(
      `[client] GEOFENCE ${msg.data.event_type}: ${msg.data.truck_id} -> ${msg.data.facility_name} (${msg.data.facility_id})`,
    );
  }
});

ws.on("error", (e) => console.error("[client] error:", e.message));

setTimeout(() => {
  console.log(
    `[client] done: ${telemetry} telemetry, ${geofence} geofence events, TRK-1003 slow samples=${slowSpeeds.length}`,
  );
  ws.close();
  process.exit(0);
}, 18000);
