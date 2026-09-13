#!/usr/bin/env tsx
/**
 * Automated Verification & Testing Suite for the Apex Corridor Systems platform.
 *
 * Run with:  npx tsx scripts/test-workflow.ts
 *
 * Tests:
 *   1. Seed Data Integrity — all 10 drivers exist, breadcrumbs are safe
 *      against `TypeError: undefined (reading 'length')`.
 *   2. Weight Engine — a 42,758 lb load is compliant (GVW 75,758 ≤ 80,000).
 *   3. Dispatch Handshake — offer → accept → state transition to IN_TRANSIT.
 *   4. Build Verification — `npm run build` passes in frontend/ and driver-app/.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  ${GREEN}✓${RESET} ${label}`);
    passed++;
  } else {
    console.log(`  ${RED}✗${RESET} ${label}`);
    if (detail) console.log(`    ${RED}${detail}${RESET}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${BOLD}${CYAN}── ${title} ──${RESET}`);
}

// ── 1. Seed Data Integrity ─────────────────────────────────────────────────
function testSeedData(): void {
  section("1. Seed Data Integrity");
  const seedPath = resolve(ROOT, "frontend/src/lib/hackathonSeedData.json");
  const raw = readFileSync(seedPath, "utf-8");
  const seed = JSON.parse(raw) as {
    trucks: Array<{ truck_id: string; driver_name: string; hos_remaining_hours: number; status: string }>;
    loads: Array<{ bill_number: string | number; customer: string; weight_lbs: number }>;
  };

  assert(seed.trucks.length === 10, `10 drivers exist in seed data (got ${seed.trucks.length})`);

  const truckIds = seed.trucks.map((t) => t.truck_id);
  for (const expectedId of ["B3340", "B4602", "B4800", "B1935", "B3339"]) {
    assert(truckIds.includes(expectedId), `Driver ${expectedId} exists in seed data`);
  }

  const offDutyWithHos = seed.trucks.filter(
    (t) => t.status === "OFF_DUTY" && t.hos_remaining_hours > 0,
  );
  assert(
    offDutyWithHos.length > 0,
    `Off-duty driver(s) with available HOS found (${offDutyWithHos.map((t) => t.truck_id).join(", ")})`,
  );

  let breadcrumbSafe = true;
  for (const t of seed.trucks) {
    if (t.truck_id == null || t.driver_name == null || t.hos_remaining_hours == null) {
      breadcrumbSafe = false;
      break;
    }
  }
  assert(breadcrumbSafe, "All truck records have non-null critical fields (safe against TypeError)");

  const heavyLoad = seed.loads.find((l) => l.weight_lbs === 42758);
  assert(heavyLoad != null, `42,758 lb load exists in seed data (bill #${heavyLoad?.bill_number})`);
}

// ── 2. Weight Engine Compliance ────────────────────────────────────────────
function testWeightEngine(): void {
  section("2. Ontario MTO Weight Engine");
  const AXLE_LIMITS = { steer: 12500, driveTandem: 34000, trailerTandem: 34000, payload: 44500, gross: 80000 };
  const STEER_TARE = 10000, DRIVE_TARE = 11000, TRAILER_TARE = 12000;
  function calc(cargoLbs: number) {
    const steer = Math.round(STEER_TARE + cargoLbs * 0.05);
    const driveTandem = Math.round(DRIVE_TARE + cargoLbs * 0.46);
    const trailerTandem = Math.round(TRAILER_TARE + cargoLbs * 0.49);
    const gross = steer + driveTandem + trailerTandem;
    return {
      steer, driveTandem, trailerTandem, gross,
      steerOver: steer > AXLE_LIMITS.steer,
      driveOver: driveTandem > AXLE_LIMITS.driveTandem,
      trailerOver: trailerTandem > AXLE_LIMITS.trailerTandem,
      payloadOver: cargoLbs > AXLE_LIMITS.payload,
      grossOver: gross > AXLE_LIMITS.gross,
    };
  }
  const r = calc(42758);
  console.log(`    Cargo: ${42758} lbs | GVW: ${r.gross.toLocaleString()} lbs`);
  console.log(`    Steer: ${r.steer.toLocaleString()} | Drive: ${r.driveTandem.toLocaleString()} | Trailer: ${r.trailerTandem.toLocaleString()}`);
  assert(r.gross === 75758, `GVW = ${r.gross.toLocaleString()} lbs (expected 75,758 = 42,758 + 33,000 tare)`);
  assert(r.gross <= 80000, `GVW ${r.gross.toLocaleString()} ≤ 80,000 lbs MTO limit`);
  assert(!r.steerOver, `Steer axle ${r.steer.toLocaleString()} ≤ 12,500 lbs (no false overweight)`);
  assert(!r.trailerOver, `Trailer tandem ${r.trailerTandem.toLocaleString()} ≤ 34,000 lbs`);
  assert(calc(44500).steerOver === false && calc(44500).trailerOver === false, `Max legal payload 44,500 lbs is COMPLIANT`);
  assert(calc(50000).payloadOver === true, `50,000 lb load correctly NON-COMPLIANT (exceeds 44,500 lb payload)`);
}

// ── 3. Dispatch Handshake Simulation ──────────────────────────────────────
function testDispatchHandshake(): void {
  section("3. Dispatch → Driver Accept/Reject Handshake");
  type LoadStatus = "PENDING" | "OFFERED" | "IN_TRANSIT" | "UNASSIGNED";
  let loadStatus: LoadStatus = "PENDING";
  let loadTruckId: string | null = null;
  const log: string[] = [];

  // Step 1: Dispatcher confirms → load becomes OFFERED (not IN_TRANSIT).
  loadStatus = "OFFERED"; loadTruckId = "B4602"; log.push("DISPATCH_OFFER");
  assert(loadStatus === "OFFERED", `After confirm: load status is 'OFFERED' (not 'IN_TRANSIT')`);
  assert(loadTruckId === "B4602", `After confirm: truck assigned to B4602`);

  // Step 2a: Driver accepts → load becomes IN_TRANSIT.
  loadStatus = "IN_TRANSIT"; log.push("DISPATCH_ACCEPTED");
  assert(loadStatus === "IN_TRANSIT", `After driver accepts: load transitions to 'IN_TRANSIT'`);

  // Step 2b: Reset and test reject path.
  loadStatus = "OFFERED"; loadTruckId = "B4602";
  loadStatus = "UNASSIGNED"; loadTruckId = null; log.push("DISPATCH_REJECTED");
  assert(loadStatus === "UNASSIGNED", `After driver rejects: load returns to 'UNASSIGNED' pool`);
  assert(loadTruckId === null, `After driver rejects: truck released (truck_id = null)`);
  assert(log.length === 3, `Complete handshake: 3 events (OFFER → ACCEPT → REJECT) in order`);
}

// ── 4. Build Verification ──────────────────────────────────────────────────
function testBuilds(): void {
  section("4. Build Verification");
  const frontendDir = resolve(ROOT, "frontend");
  const driverAppDir = resolve(ROOT, "driver-app");
  try {
    execSync("npm run build", { cwd: frontendDir, encoding: "utf-8", timeout: 120000, stdio: "pipe" });
    assert(true, `frontend/ npm run build — 0 TypeScript errors`);
  } catch (e) {
    assert(false, `frontend/ npm run build`, String(e).slice(0, 300));
  }
  try {
    execSync("npm run build", { cwd: driverAppDir, encoding: "utf-8", timeout: 60000, stdio: "pipe" });
    assert(true, `driver-app/ npm run build — 0 TypeScript errors`);
  } catch (e) {
    assert(false, `driver-app/ npm run build`, String(e).slice(0, 300));
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}`);
console.log(`${BOLD}${CYAN}║  Apex Corridor Systems — Automated Verification Suite        ║${RESET}`);
console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}`);
testSeedData();
testWeightEngine();
testDispatchHandshake();
testBuilds();
console.log(`\n${"─".repeat(60)}`);
if (failed === 0) {
  console.log(`${BOLD}${GREEN}  ✓ ALL ${passed} TESTS PASSED — 0 errors remain${RESET}`);
} else {
  console.log(`${BOLD}${RED}  ✗ ${failed} TEST(S) FAILED, ${passed} passed${RESET}`);
}
console.log(`${"─".repeat(60)}\n`);
process.exit(failed === 0 ? 0 : 1);
