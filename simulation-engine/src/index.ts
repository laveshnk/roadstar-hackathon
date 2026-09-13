import { createServer } from "http";
import { PORT, TICK_INTERVAL_MS, TIME_WARP_FACTOR } from "./config.js";
import { createInitialTrucks } from "./data/trucks.js";
import { facilities } from "./data/facilities.js";
import { Simulator } from "./simulation/engine.js";
import { handleHttpRequest } from "./server/http.js";
import { createFleetServer } from "./server/ws.js";

const startedAt = Date.now();
const trucks = createInitialTrucks(startedAt);
const simulator = new Simulator(facilities, trucks, TIME_WARP_FACTOR);

// HTTP snapshot endpoint (GET /api/fleet/snapshot).
const httpServer = createServer((req, res) =>
  handleHttpRequest(req, res, () => simulator.getSnapshot()),
);

// WebSocket server (initial snapshot on connect + live event broadcast).
const { broadcast } = createFleetServer(httpServer, () => simulator.getSnapshot());
simulator.onEvent = (event) => broadcast(event);

httpServer.listen(PORT, () => {
  const line = "=".repeat(59);
  console.log(line);
  console.log("  Apex Corridor Systems — Fleet Telemetry Simulation Engine");
  console.log(line);
  console.log(`  HTTP snapshot : http://localhost:${PORT}/api/fleet/snapshot`);
  console.log(`  WebSocket     : ws://localhost:${PORT}`);
  console.log(`  Time warp     : ${TIME_WARP_FACTOR}x`);
  console.log(
    `  Tick          : ${TICK_INTERVAL_MS}ms | Telemetry: every 2s (moving trucks)`,
  );
  console.log(`  Active trucks : ${trucks.length}`);
  for (const t of trucks) {
    console.log(
      `    • ${t.id} (${t.driver_name}) — ${t.scenario} [${t.duty_status}]`,
    );
  }
  console.log("-".repeat(59));
});

// Drive the simulation.
setInterval(() => simulator.tick(), TICK_INTERVAL_MS);
