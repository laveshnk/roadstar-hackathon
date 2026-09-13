"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Header, { type FleetStats, type TabId } from "./Header";
import Sidebar from "./Sidebar";
import TrackTracePanel from "./TrackTracePanel";
import AssignDriverModal from "./AssignDriverModal";
import DetentionInvoiceModal from "./DetentionInvoiceModal";
import DetentionLedger from "./DetentionLedger";
import SpotQuoteOptimizer from "./SpotQuoteOptimizer";
import AICoPilot, { type TourController, type FleetContext, type OperationalAlert, emitTutorialAction } from "./AICoPilot";
import { useFleetSocket } from "@/hooks/useFleetSocket";
import {
  closedDetentionLogs,
  facilities,
  loads as initialLoads,
  trucks as initialTrucks,
  buildTrucksWithRoadRoutes,
  type SimTruck,
} from "@/lib/mockData";
import { activeLogFromTruck, advanceTruck } from "@/lib/simulation";
import { CLOCK_INTERVAL_MS, MOVEMENT_INTERVAL_MS } from "@/lib/config";
import type { MapStyle } from "@/lib/config";
import type { DetentionLog, Load, TruckSnapshot } from "@/lib/types";
import { computeSpotQuote, type SpotQuoteResult } from "@/lib/spotQuote";

/** Map the simulation engine's TruckSnapshot to the frontend's SimTruck. */
function snapshotToSimTruck(snap: TruckSnapshot, fallback: SimTruck | undefined): SimTruck {
  const dutyStatusMap: Record<string, "IN_TRANSIT" | "DOCKED_WAITING" | "OFF_DUTY"> = {
    DRIVING: "IN_TRANSIT",
    DOCKED_WAITING: "DOCKED_WAITING",
    OFF_DUTY: "OFF_DUTY",
    ON_DUTY_NOT_DRIVING: "IN_TRANSIT",
  };
  return {
    ...fallback,
    id: snap.truck_id,
    truck_number: snap.truck_id,
    driver_name: snap.driver_name,
    lat: snap.lat,
    lng: snap.lng,
    speed: snap.speed_kmh,
    odometer: Math.round(snap.odometer_km),
    heading: snap.heading,
    current_status: dutyStatusMap[snap.duty_status] ?? "IN_TRANSIT",
    current_facility_id: snap.current_facility_id,
    dock_arrival_time: snap.dock_arrival_time,
    hos_remaining_hours: snap.hos_drive_remaining_min / 60,
  } as SimTruck;
}

// Leaflet accesses `window` at render, so the map is loaded client-only.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-400 dark:bg-[#0B0F17] dark:text-slate-500">
      Loading map…
    </div>
  ),
});

// Captured once at module load so the initial server/client render is stable
// (avoids a hydration mismatch); the clock effect takes over live afterwards.
const INITIAL_NOW = Date.now();

export default function Dashboard() {
  // Backend connectivity: strict connection to simulation engine on port 4001.
  const { status: connectionStatus, liveTrucks, lastDispatchEvent, sendDispatchOffer } = useFleetSocket();
  // Demo mode toggle (for offline presentations). When ON, forces mock data
  // even if the backend is partially connected.
  const [demoMode, setDemoMode] = useState<boolean>(() =>
    typeof window !== "undefined" && window.location.search.includes("demo=true"),
  );

  // When the backend is connected, use live trucks; otherwise fall back to
  // mock data so the fleet is ALWAYS visible on the map (even without the
  // simulation engine running). This was previously gated behind demoMode
  // which caused the map to appear empty by default.
  const backendActive = connectionStatus === "CONNECTED" && liveTrucks.length > 0;
  const effectiveTrucks: SimTruck[] = useMemo(() => {
    if (backendActive) {
      return liveTrucks.map((snap) => {
        const fallback = initialTrucks.find((t) => t.id === snap.truck_id);
        return snapshotToSimTruck(snap, fallback);
      });
    }
    // Not connected: show mock trucks so the map is never empty.
    return initialTrucks;
  }, [backendActive, liveTrucks]);

  const [trucks, setTrucks] = useState<SimTruck[]>(effectiveTrucks);
  const [loads, setLoads] = useState<Load[]>(initialLoads);
  const [now, setNow] = useState<number>(INITIAL_NOW);
  // Default to the Milton detention-alert truck (B3339, 150 min docked) so
  // the panel opens on a live, accruing detention alert on real data.
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(
    "B3339",
  );
  const [mapStyle, setMapStyle] = useState<MapStyle>("street");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // True while OSRM road routes are being fetched (shows a subtle indicator).
  const [routesLoading, setRoutesLoading] = useState(true);
  // Active navigation tab.
  const [activeTab, setActiveTab] = useState<TabId>("map");
  // Toast notification for driver-reported delays.
  const [delayToast, setDelayToast] = useState<string | null>(null);
  // Toast notification for dispatch handshake events (offer sent / accepted / rejected).
  const [dispatchToast, setDispatchToast] = useState<{ msg: string; tone: "blue" | "green" | "amber" } | null>(null);

  // Dispatcher action state.
  const [assignModalLoad, setAssignModalLoad] = useState<Load | null>(null);
  const [invoiceModalLog, setInvoiceModalLog] = useState<DetentionLog | null>(
    null,
  );
  // Tracks which active detention sessions have been invoiced (moved from
  // unbilled → billed MTD). Keyed by truck_id.
  const [invoicedTruckIds, setInvoicedTruckIds] = useState<Set<string>>(
    new Set(),
  );
  // AI Spot-Quote Optimizer modal state.
  const [spotQuoteResult, setSpotQuoteResult] = useState<SpotQuoteResult | null>(null);

  /** The synthetic tour spot-quote load: Mondelez Milton → London, $1,450. */
  const tourSpotQuoteLoad: Load = useMemo(() => ({
    id: "SQ-TOUR-001",
    truck_id: null,
    customer: "MONDELEZ INTERNATIONAL c/o UBER FREIGHT",
    origin_facility_id: "FAC-MLT-DOCK",
    destination_facility_id: "FAC-LON-HUB",
    commodity: "Packaged cookies and snack foods",
    weight_kg: 11132,
    pickup_time: new Date().toISOString(),
    status: "PENDING",
    bill_number: "SQ-001",
    origin_city: "MILTON",
    destination_city: "LONDON",
    load_type: "Dry Van",
    weight_lbs: 24541,
    pallets: 26,
    temp_controlled: false,
    temperature: "Ambient",
  }), []);

  /** Tour driver overrides to pin the demo narrative values. */
  const tourDriverOverrides = useMemo(() => ({
    B4602: { driveRemainingH: 1.2, status: "DISQUALIFIED" as const, reason: "Only 1.2h remaining on daily driving clock (13-hour rule violation)." },
    B4800: { status: "SUBOPTIMAL" as const, reason: "65 km empty deadhead ($110 fuel waste)." },
    B3340: { status: "OPTIMAL" as const, reason: "44.7h HOS remaining, 4 km deadhead, Reefer ready." },
  }), []);

  // Live clock (drives the header clock + ticking detention durations).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Initialize trucks from mock data via useState initializer. Never overwrite
  // afterward — local mutations (DISPATCH_ACCEPTED, advanceTruck) must persist.

  // When the backend is connected, merge live telemetry into trucks state.
  // IMPORTANT: Only update trucks that are already IN_TRANSIT from the backend
  // snapshot — never overwrite locally-activated trucks (e.g., DISPATCH_ACCEPTED).
  useEffect(() => {
    if (!backendActive || liveTrucks.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTrucks((prev) => prev.map((t) => {
      // Skip locally-activated trucks — their state is managed by the
      // dispatch handshake, not the backend telemetry.
      if (t.assigned_load_id && t.routePoints.length > 1) return t;
      const live = liveTrucks.find((s) => s.truck_id === t.id);
      if (!live) return t;
      const fallback = prev.find((p) => p.id === t.id);
      return snapshotToSimTruck(live, fallback);
    }));
  }, [backendActive, liveTrucks]);

  // Fleet movement simulation — mounted ONCE with [] deps so the interval
  // is never torn down/re-created. Uses a ref for backendActive so the
  // interval can check the current connection state without being a dependency.
  const backendActiveRef = useRef(backendActive);
  useEffect(() => { backendActiveRef.current = backendActive; }, [backendActive]);
  const [movementTick, setMovementTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      // Skip local movement when the backend is live (telemetry drives it).
      if (backendActiveRef.current) return;
      setTrucks((prev) => prev.map((t) => advanceTruck(t)));
      setMovementTick((t) => t + 1);
    }, MOVEMENT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Fetch real OSRM road routes on mount (client-only). Runs ONCE.
  // Only replaces routePoints for trucks that haven't been dynamically
  // activated (e.g., by DISPATCH_ACCEPTED) — preserves their corridor routes.
  useEffect(() => {
    if (backendActiveRef.current) { setRoutesLoading(false); return; }
    let cancelled = false;
    buildTrucksWithRoadRoutes().then((roadTrucks) => {
      if (cancelled) return;
      setTrucks((prev) =>
        prev.map((t) => {
          // Skip trucks that have been dynamically activated — their routePoints
          // were set by DISPATCH_ACCEPTED and shouldn't be overwritten.
          if (t.current_status === "IN_TRANSIT" && t.routePoints.length > 1 && t.assigned_load_id) {
            return t;
          }
          const replacement = roadTrucks.find((r) => r.id === t.id);
          if (!replacement || replacement.routePoints.length < 2) return t;
          return { ...replacement, breadcrumb: t.breadcrumb, odometer: t.odometer, speed: t.speed };
        }),
      );
      setRoutesLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const selectedTruck = useMemo(
    () => trucks.find((t) => t.id === selectedTruckId) ?? null,
    [trucks, selectedTruckId],
  );

  // Active detention logs derived live from docked trucks (customer/terminal only;
  // hub yard dwell is not billed). This is the real-time projection of the
  // detention_logs "ACTIVE" rows until a departure_time is written.
  const activeDetentionLogs = useMemo(() => {
    return trucks
      .filter((t) => {
        if (t.current_status !== "DOCKED_WAITING" || !t.current_facility_id)
          return false;
        const f = facilities.find((x) => x.id === t.current_facility_id);
        return f ? f.type !== "HUB" : false;
      })
      .map((t) => activeLogFromTruck(t, t.assigned_load_id ?? `LD-${t.id}`, now));
  }, [trucks, now]);

  const alertTruckIds = useMemo(
    () =>
      new Set(
        activeDetentionLogs
          .filter((l) => l.billable_detention_minutes > 0)
          .map((l) => l.truck_id),
      ),
    [activeDetentionLogs],
  );

  const selectedActiveLog = useMemo(
    () => activeDetentionLogs.find((l) => l.truck_id === selectedTruckId),
    [activeDetentionLogs, selectedTruckId],
  );

  const stats: FleetStats = useMemo(() => {
    const inTransit = trucks.filter(
      (t) => t.current_status === "IN_TRANSIT",
    ).length;
    const docked = trucks.filter(
      (t) => t.current_status === "DOCKED_WAITING",
    ).length;
    const offDuty = trucks.filter((t) => t.current_status === "OFF_DUTY").length;
    const alerts = activeDetentionLogs.filter(
      (l) =>
        l.billable_detention_minutes > 0 && !invoicedTruckIds.has(l.truck_id),
    ).length;
    // Unbilled = active alerts not yet invoiced.
    const unbilled = activeDetentionLogs
      .filter((l) => !invoicedTruckIds.has(l.truck_id))
      .reduce((s, l) => s + l.detention_fee_owed, 0);
    // Billed MTD = closed history + any active sessions that were invoiced.
    const invoicedAmount = activeDetentionLogs
      .filter((l) => invoicedTruckIds.has(l.truck_id))
      .reduce((s, l) => s + l.detention_fee_owed, 0);
    const billedMtd =
      closedDetentionLogs.reduce((s, l) => s + l.detention_fee_owed, 0) +
      invoicedAmount;
    return {
      online: inTransit + docked,
      total: trucks.length,
      inTransit,
      docked,
      offDuty,
      alerts,
      unbilled,
      billedMtd,
    };
  }, [trucks, activeDetentionLogs, invoicedTruckIds]);

  const handleSelect = useCallback((id: string) => setSelectedTruckId(id), []);
  const handleToggleStyle = useCallback(
    () => setMapStyle((s) => (s === "street" ? "satellite" : "street")),
    [],
  );
  const handleToggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);

  // Pre-dispatch assignment: confirms a truck for an unassigned load.
  // Does NOT immediately transition to "In-Transit" — sets load to OFFERED
  // and broadcasts a DISPATCH_OFFER to the driver app via the WS relay.
  const handleConfirmAssignment = useCallback(
    (truckId: string) => {
      if (!assignModalLoad) return;
      const truck = trucks.find((t) => t.id === truckId);
      // 1. Set load status to OFFERED (pending driver acceptance).
      setLoads((prev) =>
        prev.map((l) =>
          l.id === assignModalLoad.id
            ? { ...l, truck_id: truckId, status: "OFFERED" }
            : l,
        ),
      );
      // 2. Broadcast DISPATCH_OFFER event.
      const origFac = facilities.find((f) => f.id === assignModalLoad.origin_facility_id);
      const destFac = facilities.find((f) => f.id === assignModalLoad.destination_facility_id);
      const deadheadKm = origFac && truck
        ? Math.round(Math.sqrt((origFac.lat - truck.lat) ** 2 + (origFac.lng - truck.lng) ** 2) * 111)
        : 4;
      sendDispatchOffer({
        loadId: assignModalLoad.id,
        driverId: truck?.driver_name ?? "Driver1",
        truckId: truckId,
        driverName: truck?.driver_name ?? "Driver1",
        customer: assignModalLoad.customer,
        origin: assignModalLoad.origin_city ?? origFac?.name ?? "Origin",
        destination: assignModalLoad.destination_city ?? destFac?.name ?? "Destination",
        deadheadKm,
        weightLbs: assignModalLoad.weight_lbs ?? 20000,
        pallets: assignModalLoad.pallets ?? 0,
        cargoType: assignModalLoad.load_type ?? "Dry Van",
        tempControlled: assignModalLoad.temp_controlled ?? false,
        temperature: assignModalLoad.temperature ?? null,
        payout: assignModalLoad.weight_lbs ? Math.round(assignModalLoad.weight_lbs * 0.06 / 10) * 10 : 1450,
        timestamp: new Date().toISOString(),
      });
      // 3. Show blue toast and close modal.
      setDispatchToast({ msg: `📤 Dispatch offer transmitted to ${truck?.driver_name ?? "Driver"} (${truckId})...`, tone: "blue" });
      setAssignModalLoad(null);
    },
    [assignModalLoad, trucks, sendDispatchOffer],
  );

  // Detention billing: marks an active session as invoiced (unbilled → billed).
  const handleGenerateInvoice = useCallback(() => {
    if (!selectedTruckId) return;
    const log = activeDetentionLogs.find(
      (l) => l.truck_id === selectedTruckId,
    );
    if (log) {
      setInvoicedTruckIds((prev) => new Set(prev).add(selectedTruckId));
      setInvoiceModalLog(log);
    }
  }, [selectedTruckId, activeDetentionLogs]);

  // Driver-reported 401 delay → now handled via lastDispatchEvent (DRIVER_DELAY).

  // Auto-dismiss delay toast after 6 seconds.
  useEffect(() => {
    if (!delayToast) return;
    const id = setTimeout(() => setDelayToast(null), 6000);
    return () => clearTimeout(id);
  }, [delayToast]);

  // Auto-dismiss dispatch toast after 7 seconds.
  useEffect(() => {
    if (!dispatchToast) return;
    const id = setTimeout(() => setDispatchToast(null), 7000);
    return () => clearTimeout(id);
  }, [dispatchToast]);

  // Handle dispatch handshake responses from the driver app.
  // DISPATCH_ACCEPTED → load → IN_TRANSIT, activate truck, green toast.
  // DISPATCH_REJECTED → load → UNASSIGNED, amber toast.
  // DRIVER_DELAY → delay toast + operational alert.
  // NOTE: We read `loads` and `facilities` from refs to avoid the infinite
  // update loop that occurs when setLoads() changes `loads`, which would
  // re-trigger this effect (since `loads` was previously in the deps array).
  const loadsRef = useRef(loads);
  const facilitiesRef = useRef(facilities);
  useEffect(() => {
    loadsRef.current = loads;
    facilitiesRef.current = facilities;
  });

  useEffect(() => {
    if (!lastDispatchEvent) return;
    const evt = lastDispatchEvent;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (evt.type === "DISPATCH_ACCEPTED") {
      const data = evt.data;
      const acceptedLoad = loadsRef.current.find((l) => l.id === data.loadId);
      setLoads((prev) => prev.map((l) =>
        l.id === data.loadId ? { ...l, status: "IN_TRANSIT" } : l,
      ));
      // Activate the truck: flip from OFF_DUTY → IN_TRANSIT, assign the
      // load's route and destination so advanceTruck() starts moving it.
      // Match by truckId OR driverName to handle cross-origin event naming.
      setTrucks((prev) => prev.map((t) => {
        const isMatch = t.id === data.truckId
          || t.id === "TRK-1005" || t.id === "B5500"
          || t.driver_name?.toLowerCase().includes("kowalski")
          || t.driver_name === data.driverId
          || t.driver_name === data.driverName;
        if (!isMatch) return t;
        // Hwy 401 Corridor route: Milton → Meadowvale → Airport → Rexdale → Woodbridge
        const corridorRoute = [
          { lat: 43.5183, lng: -79.8774 }, // Milton
          { lat: 43.5890, lng: -79.7340 }, // Meadowvale / 401
          { lat: 43.6532, lng: -79.6450 }, // Airport / 401
          { lat: 43.7210, lng: -79.6100 }, // Rexdale
          { lat: 43.7844, lng: -79.5975 }, // Woodbridge terminal
        ];
        return {
          ...t,
          current_status: "IN_TRANSIT" as const,
          assigned_load_id: data.loadId,
          origin_facility_id: acceptedLoad?.origin_facility_id ?? t.origin_facility_id,
          destination_facility_id: acceptedLoad?.destination_facility_id ?? t.destination_facility_id,
          baseSpeed: 92,
          speed: 92,
          progress: 0,
          direction: 1 as const,
          current_facility_id: null,
          dock_arrival_time: null,
          lat: corridorRoute[0].lat,
          lng: corridorRoute[0].lng,
          // Always provide the Hwy 401 corridor route — don't rely on existing
          // routePoints since OFF_DUTY trucks have empty routes.
          routePoints: corridorRoute,
        };
      }));
      setDispatchToast({ msg: `✅ Driver accepted load ${data.loadId}`, tone: "green" });
      emitTutorialAction("DRIVER_ACCEPTED");
    } else if (evt.type === "DISPATCH_REJECTED") {
      setLoads((prev) => prev.map((l) =>
        l.id === evt.data.loadId ? { ...l, truck_id: null, status: "UNASSIGNED" } : l,
      ));
      setDispatchToast({ msg: `⚠️ Driver declined load ${evt.data.loadId}. Returned to unassigned pool`, tone: "amber" });
    } else if (evt.type === "DRIVER_DELAY" || evt.type === "INCIDENT_REPORT") {
      const d = evt.data;
      setDelayToast(`🚨 ${d.driverName} (Truck ${d.truckId}) reported a Hwy 401 delay (+${d.delayMinutes} min).`);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [lastDispatchEvent]);

  // Proactive operational issue alerts (#5).
  // - Detention Threshold: docked >90 min (30m before free time expires).
  // - HOS Dock Trap: docked truck's remaining on-duty <45m.
  // - Expedited Appointment: urgent package within 45m and not loaded.
  // - Driver Delay: from lastDispatchEvent DRIVER_DELAY.
  const operationalAlerts: OperationalAlert[] = useMemo(() => {
    const alerts: OperationalAlert[] = [];
    for (const log of activeDetentionLogs) {
      if (log.total_dock_minutes > 90) {
        alerts.push({
          id: `detention-${log.truck_id}-${Math.floor(log.total_dock_minutes / 10)}`,
          type: "DETENTION_THRESHOLD",
          severity: log.billable_detention_minutes > 0 ? "red" : "amber",
          title: `Detention Alert: Truck ${log.truck_id}`,
          message: `Docked ${Math.round(log.total_dock_minutes)} min — ${log.billable_detention_minutes > 0 ? "$" + log.detention_fee_owed + " accruing" : "30 min before free window expires"}.`,
          truckId: log.truck_id,
        });
      }
      const truck = trucks.find((t) => t.id === log.truck_id);
      const hosRemaining = (truck?.hos_remaining_hours ?? 0) * 60;
      if (hosRemaining > 0 && hosRemaining < 45) {
        alerts.push({
          id: `hos-trap-${log.truck_id}`,
          type: "HOS_DOCK_TRAP",
          severity: "red",
          title: `HOS Dock Trap: Truck ${log.truck_id}`,
          message: `Only ${Math.round(hosRemaining)} min of on-duty window remaining while docked. Risk of HOS violation.`,
          truckId: log.truck_id,
        });
      }
    }
    for (const load of loads) {
      if (load.is_urgent_expiring && load.delivery_appointment_window && !load.truck_id) {
        const minsLeft = (new Date(load.delivery_appointment_window).getTime() - now) / 60000;
        if (minsLeft > 0 && minsLeft < 45) {
          alerts.push({
            id: `expedited-${load.id}`,
            type: "EXPEDITED_APPOINTMENT",
            severity: "amber",
            title: `Expedited Appointment: ${load.id}`,
            message: `Appointment in ${Math.round(minsLeft)} min — load not yet assigned to a driver.`,
          });
        }
      }
    }
    if (lastDispatchEvent?.type === "DRIVER_DELAY" || lastDispatchEvent?.type === "INCIDENT_REPORT") {
      const d = lastDispatchEvent.data;
      alerts.push({
        id: `delay-${d.truckId}-${d.timestamp}`,
        type: "DRIVER_DELAY",
        severity: "amber",
        title: `Driver Delay: ${d.driverName}`,
        message: `Reported +${d.delayMinutes} min delay at ${d.location}.`,
        truckId: d.truckId,
      });
    }
    return alerts;
  }, [activeDetentionLogs, trucks, loads, now, lastDispatchEvent]);

  // Open the AI Spot-Quote Optimizer for the tour load (with demo overrides).
  const openTourSpotQuote = useCallback(() => {
    const result = computeSpotQuote(
      tourSpotQuoteLoad, trucks, facilities, 1450, tourDriverOverrides,
    );
    setSpotQuoteResult(result);
  }, [trucks, tourSpotQuoteLoad, tourDriverOverrides]);

  // Confirm & Instant Dispatch from the Spot-Quote Optimizer.
  const handleSpotQuoteConfirm = useCallback(() => {
    if (!spotQuoteResult?.optimal) return;
    const truckId = spotQuoteResult.optimal.truck.id;
    const truck = spotQuoteResult.optimal.truck;
    const loadId = spotQuoteResult.load.id;
    const load = spotQuoteResult.load;
    // Set load to OFFERED (pending driver acceptance) — not ASSIGNED.
    setLoads((prev) => prev.map((l) =>
      l.id === loadId ? { ...l, truck_id: truckId, status: "OFFERED" } : l,
    ));
    // Broadcast DISPATCH_OFFER.
    const origFac = facilities.find((f) => f.id === load.origin_facility_id);
    const destFac = facilities.find((f) => f.id === load.destination_facility_id);
    sendDispatchOffer({
      loadId, driverId: truck.driver_name, truckId, driverName: truck.driver_name,
      customer: load.customer,
      origin: load.origin_city ?? origFac?.name ?? "Origin",
      destination: load.destination_city ?? destFac?.name ?? "Destination",
      deadheadKm: spotQuoteResult.optimal.deadheadKm,
      weightLbs: load.weight_lbs ?? 20000,
      pallets: load.pallets ?? 0,
      cargoType: load.load_type ?? "Dry Van",
      tempControlled: load.temp_controlled ?? false,
      temperature: load.temperature ?? null,
      payout: spotQuoteResult.targetRate,
      timestamp: new Date().toISOString(),
    });
    setDispatchToast({ msg: `📤 Dispatch offer transmitted to ${truck.driver_name} (${truckId})...`, tone: "blue" });
    setSpotQuoteResult(null);
  }, [spotQuoteResult, sendDispatchOffer]);

  // Tour controller: callbacks the AICoPilot uses to drive the walkthrough.
  const tourController: TourController = useMemo(() => ({
    switchTab: (tab) => setActiveTab(tab),
    selectTruck: (id) => setSelectedTruckId(id),
    openSpotQuote: openTourSpotQuote,
    confirmDispatch: handleSpotQuoteConfirm,
    closeModal: () => { setSpotQuoteResult(null); setAssignModalLoad(null); },
  }), [openTourSpotQuote, handleSpotQuoteConfirm]);

  // Fleet context for the AI Co-Pilot's LLM queries.
  const fleetContext: FleetContext = useMemo(() => ({
    trucks, loads, facilities, activeDetentionLogs, invoicedTruckIds,
  }), [trucks, loads, activeDetentionLogs, invoicedTruckIds]);

  // Manually open the spot-quote optimizer for any unassigned load (no overrides).
  const handleOptimizeLoad = useCallback((load: Load) => {
    // Estimate a target rate: $0.10/lb + $2/km transit distance.
    const origFac = facilities.find((f) => f.id === load.origin_facility_id);
    const destFac = facilities.find((f) => f.id === load.destination_facility_id);
    const transitKm = origFac && destFac
      ? Math.round(Math.sqrt((destFac.lat - origFac.lat) ** 2 + (destFac.lng - origFac.lng) ** 2) * 111)
      : 100;
    const weightLbs = load.weight_lbs ?? 20000;
    const targetRate = Math.round((weightLbs * 0.06 + transitKm * 2) / 10) * 10;
    const result = computeSpotQuote(load, trucks, facilities, targetRate);
    setSpotQuoteResult(result);
  }, [trucks]);

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100">
      <Header stats={stats} now={now} activeTab={activeTab} onTabChange={setActiveTab} connectionStatus={connectionStatus} demoMode={demoMode} onToggleDemo={() => setDemoMode((d) => !d)} />

      {/* Delay toast */}
      {delayToast && (
        <div className="fixed left-1/2 top-16 z-[3000] -translate-x-1/2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-medium text-orange-700 shadow-xl backdrop-blur">
          {delayToast}
        </div>
      )}

      {/* Dispatch handshake toast */}
      {dispatchToast && (
        <div className={`fixed left-1/2 top-28 z-[3000] -translate-x-1/2 rounded-lg border px-4 py-2 text-xs font-medium shadow-xl backdrop-blur ${dispatchToast.tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : dispatchToast.tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
          {dispatchToast.msg}
        </div>
      )}

      {activeTab === "map" && (
        <div className="flex min-h-0 flex-1">
          <Sidebar
            open={sidebarOpen}
            onToggle={handleToggleSidebar}
            trucks={trucks}
            facilities={facilities}
            loads={loads}
            activeDetentionLogs={activeDetentionLogs}
            selectedTruckId={selectedTruckId}
            onSelectTruck={handleSelect}
            alertTruckIds={alertTruckIds}
            onAssignDriver={(load) => { setAssignModalLoad(load); emitTutorialAction("OPEN_ASSIGN_MODAL"); }}
          />
          <main className="relative min-w-0 flex-1">
            <MapView
              facilities={facilities}
              trucks={trucks}
              selectedTruckId={selectedTruckId}
              mapStyle={mapStyle}
              onToggleStyle={handleToggleStyle}
              onSelectTruck={handleSelect}
              tick={movementTick}
            />
            {routesLoading && !backendActive && (
              <div className="pointer-events-none absolute left-3 top-3 z-[900] flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-600 shadow-lg backdrop-blur">
                <svg className="h-3.5 w-3.5 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Loading road routes…
              </div>
            )}
            {connectionStatus === "DISCONNECTED" && !demoMode && (
              <div className="pointer-events-none absolute bottom-3 right-3 z-[950]">
                <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-[10px] text-amber-700 shadow-lg backdrop-blur">
                  ⚠ Sim engine offline — showing mock fleet. Run <code className="font-mono">npm run dev</code> in <code className="font-mono">simulation-engine/</code> for live telemetry.
                </div>
              </div>
            )}
            {selectedTruck && (
              <TrackTracePanel
                truck={selectedTruck}
                facilities={facilities}
                loads={loads}
                activeLog={selectedActiveLog}
                invoiced={invoicedTruckIds.has(selectedTruck.id)}
                onGenerateInvoice={handleGenerateInvoice}
                onClose={() => setSelectedTruckId(null)}
              />
            )}
          </main>
        </div>
      )}

      {activeTab === "dispatch" && (
        <div className="flex min-h-0 flex-1">
          <Sidebar
            open={sidebarOpen}
            onToggle={handleToggleSidebar}
            trucks={trucks}
            facilities={facilities}
            loads={loads}
            activeDetentionLogs={activeDetentionLogs}
            selectedTruckId={selectedTruckId}
            onSelectTruck={handleSelect}
            alertTruckIds={alertTruckIds}
            onAssignDriver={(load) => { setAssignModalLoad(load); emitTutorialAction("OPEN_ASSIGN_MODAL"); }}
          />
          <main className="min-w-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-[#0B0F17]">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Unassigned Loads — Pre-Dispatch HOS Compliance</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Transport Canada Cycle 1: 13h drive / 14h on-duty / 70h per 7-day cycle</p>
            </div>
            <div className="grid gap-2">
              {loads.filter((l) => !l.truck_id).map((l) => (
                <div key={l.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-[#1E293B]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{l.id}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{l.customer}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => { setAssignModalLoad(l); emitTutorialAction("OPEN_ASSIGN_MODAL"); }}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-500">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" />
                        </svg>
                        Assign Driver
                      </button>
                      <button type="button" onClick={() => handleOptimizeLoad(l)}
                        className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-indigo-600 to-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:from-indigo-500 hover:to-blue-500">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
                          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                        AI Optimize Load
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{l.origin_city}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 text-slate-400 dark:text-slate-500"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{l.destination_city}</span>
                    <span className="ml-2 text-slate-500 dark:text-slate-400">{l.weight_lbs?.toLocaleString("en-CA")} lbs · {l.pallets} pal</span>
                    {l.temp_controlled && (<span className="ml-1 inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">Reefer · {l.temperature}</span>)}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-400 dark:text-slate-500" title={l.commodity}>{l.commodity}</p>
                </div>
              ))}
              {loads.filter((l) => !l.truck_id).length === 0 && (
                <div className="flex h-32 items-center justify-center text-sm text-slate-500 dark:text-slate-400">All loads have been assigned to drivers.</div>
              )}
            </div>
          </main>
        </div>
      )}

      {activeTab === "detention" && (
        <DetentionLedger
          activeLogs={activeDetentionLogs}
          closedLogs={closedDetentionLogs}
          trucks={trucks}
          facilities={facilities}
          loads={loads}
          invoicedTruckIds={invoicedTruckIds}
          onInvoice={(truckId) => setInvoicedTruckIds((prev) => new Set(prev).add(truckId))}
        />
      )}

      {/* Pre-Dispatch Audit & Assignment Modal */}
      {assignModalLoad && (
        <AssignDriverModal
          load={assignModalLoad}
          trucks={trucks}
          facilities={facilities}
          loads={loads}
          onConfirm={handleConfirmAssignment}
          onClose={() => setAssignModalLoad(null)}
        />
      )}

      {/* Detention Invoice Breakdown Modal */}
      {invoiceModalLog && (
        <DetentionInvoiceModal
          log={invoiceModalLog}
          truck={trucks.find((t) => t.id === invoiceModalLog.truck_id)}
          facility={facilities.find((f) => f.id === invoiceModalLog.facility_id)}
          load={loads.find((l) => l.id === invoiceModalLog.load_id)}
          onClose={() => setInvoiceModalLog(null)}
        />
      )}

      {/* AI Spot-Quote & Pre-Dispatch Optimizer Modal */}
      {spotQuoteResult && (
        <SpotQuoteOptimizer
          result={spotQuoteResult}
          onConfirm={handleSpotQuoteConfirm}
          onClose={() => setSpotQuoteResult(null)}
        />
      )}

      {/* Animated AI Co-Pilot & Guided Tour */}
      <AICoPilot controller={tourController} fleetContext={fleetContext} operationalAlerts={operationalAlerts} />
    </div>
  );
}
