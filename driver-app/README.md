# Apex Corridor Systems Driver ELD App

A standalone, mobile-first **Electronic Logging Device (ELD)** and dispatch
receiver for Southern Ontario truck drivers.

Built with **Vite + React + Tailwind CSS v4 + Zustand**.

## Run

```bash
cd driver-app
npm install
npm run dev      # → http://localhost:5174
# or
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Features

### 1. Digital Logbook & RODS (Transport Canada HOS)
- One-tap duty status switcher: Driving / On-Duty / Sleeper Berth / Off-Duty
- Circular SVG countdown gauges:
  - Daily Drive Clock (13h max)
  - Shift Window (14h max)
  - Cycle 1 (70h / 7-day)
- Red warning banner when any timer drops below 60 minutes

### 2. Active Dispatch & Turn-by-Turn
- Order details: Order #, Customer, Origin → Destination, Weight, Cargo Type
- Dispatch action flow: Accept Load → Arrived at Shipper → Loaded & En Route →
  Arrived at Receiver → Complete Delivery & POD
- Visual progress bar tracking dispatch stages

### 3. Live Dock Waiting Clock & Detention Counter
- Starts when driver taps "Arrived at Shipper" or "Arrived at Receiver"
- 2-hour free countdown: "Free Loading Window Remaining: 01h 59m"
- After 2 hours: screen turns red, pulses "DETENTION BILLING ACTIVE:
  Carrier billing $75.00/hr ($1.25/min)"

### 4. Operational Edge Case Triggers
- **Report Hwy 401 Traffic Delay**: Adds a 45-minute delay tag to dispatch
- **Request Emergency HOS Rest Break**: Switches duty to Sleeper Berth,
  notifies dispatch

### 5. State Connectivity
- **Zustand store** with `localStorage` persistence — survives page refreshes
- **WebSocket sync client** broadcasts status changes to the simulation engine
  on `ws://localhost:4001` (falls back to REST POST + offline queue when
  the server is unreachable)

## Default Profile
- Driver 1 (Driver1), Truck B3340
- Initial Cycle 1 balance: 44.7 hours
- Active load: Mondelez Milton → London, 24,000 lbs, Reefer 60°F
