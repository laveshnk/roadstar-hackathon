# Simulation Engine

Real-time commercial truck telematics & dispatch event simulation microservice for the
Southern Ontario freight corridor (Hwy 401 / 403 / QEW: London → Cambridge → Milton →
Mississauga → Toronto → Niagara).

Standalone Node.js + TypeScript service. No external API keys required.

## Run

```bash
npm install
npm run dev      # tsx watch, port 4001
# or
npm run build && npm start
```

### Configuration (env vars / `.env`)

| Variable           | Default | Allowed       | Description                                              |
| ------------------ | ------- | ------------- | -------------------------------------------------------- |
| `TIME_WARP_FACTOR`  | `1`     | `1,5,10,30`   | Sim-time multiplier (compress multi-hour dock waits).    |
| `PORT`              | `4001`  | any number    | HTTP + WebSocket listen port.                            |

Copy `.env.example` to `.env` to override defaults.

## Transports

- **HTTP snapshot** — `GET http://localhost:4001/api/fleet/snapshot` (CORS-enabled)
- **WebSocket** — `ws://localhost:4001` — on connect, immediately pushes a `SNAPSHOT`,
  then streams live `TELEMETRY_UPDATE` (every 2s for moving trucks) and `GEOFENCE_EVENT`
  messages.

## Event Schemas

### `SNAPSHOT` (on WS connect)
```jsonc
{ "type": "SNAPSHOT", "data": { "timestamp": "...", "time_warp_factor": 1, "trucks": [ ... ] } }
```

### `TELEMETRY_UPDATE` (every 2s, moving trucks only)
```jsonc
{ "type": "TELEMETRY_UPDATE", "data": {
  "truck_id": "TRK-1001", "driver_name": "D. Tremblay",
  "lat": 43.5183, "lng": -79.8774, "speed_kmh": 98.5, "odometer_km": 614320.8,
  "heading": 78, "duty_status": "DRIVING",
  "hos_drive_remaining_min": 510, "hos_duty_remaining_min": 570,
  "timestamp": "2026-09-10T12:35:00.000Z" } }
```

### `GEOFENCE_EVENT` (dock arrival / departure)
```jsonc
{ "type": "GEOFENCE_EVENT", "data": {
  "event_type": "GEOFENCE_ENTER",   // or GEOFENCE_EXIT
  "truck_id": "TRK-1004", "facility_id": "FAC-MISSISSAUGA-DIXIE",
  "facility_name": "Mississauga Dixie Dock",
  "lat": 43.6315, "lng": -79.6082, "timestamp": "..." } }
```

## Pre-Programmed Scenarios

| Truck     | Scenario               | Behaviour                                                                 |
| --------- | ---------------------- | ------------------------------------------------------------------------- |
| TRK-1001  | Smooth 401 Transit     | London → Toronto East Dock, 90–105 km/h, interpolated waypoints.          |
| TRK-1002  | Active Detention        | Docked at Cambridge; dock clock ticks past 120m → detention fees accrue. |
| TRK-1003  | Hwy 401 Slowdown        | Cruising ~100 km/h; drops to 12–18 km/h for 45s, then recovers.          |
| TRK-1004  | Dock Arrival & Geofence | Final leg into Mississauga Dixie; emits `GEOFENCE_ENTER`, halts, docks.   |
| TRK-1005  | Off-Duty                | Parked at London Terminal (speed 0).                                      |

### Detention billing
First **120 minutes** of dock time are free. Billable = `max(0, dock_wait − 120)`,
prorated at **$75/hr**. Only customer docks/terminals accrue (hub yards excluded).

## Test client

```bash
node test-client.mjs   # connects, logs snapshot + live events for 18s
```
