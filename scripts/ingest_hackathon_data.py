#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest_hackathon_data.py
=================================================================
One-time data-engineering ingestion script.

Reads the raw carrier export `1788655393951_Hackathon_Data.xlsx` and produces a
clean, frontend-ready seed file at:

    frontend/src/lib/hackathonSeedData.json

The export is a classic TMS dump (sheets: Tlorder, Dispatch, Driver, Trucks,
Trailers) with sparse foreign keys and "<null>" sentinel strings. This script:

  1. Parses driver GPS coordinates from DMS strings (POSLAT/POSLONG) to decimal
     degrees and filters for drivers actively located in Southern Ontario.
  2. Joins Driver + Trucks (+ Dispatch context) into 10 operational trucks.
  3. Extracts 15 representative Ontario regional customer loads from Tlorder.
  4. Mines Dispatch for historical dock detention sessions.

ASSUMPTIONS / DATA QUIRKS (documented for traceability)
* "<null>" and None are normalised to JSON null.
* POSLAT/POSLONG are DMS packed as DDMMSS + hemisphere letter, e.g. "0433201N"
  => 43 deg 33 min 01 sec N. Longitude west is negative.
* The `Trucks` sheet is a flat list of TRUCK_NUMBERs with NO foreign key to
  `Driver`. ASSIGNED_PUNIT is "<null>" for every driver; DEFAULT_PUNIT is
  usually "<null>" but occasionally carries a real TRUCK_NUMBER (e.g. "B3339").
  Therefore:
    - truck_id      := the driver's real TRUCK_NUMBER (DEFAULT_PUNIT) when it is
                       a valid, still-unused truck; otherwise the next unused
                       TRUCK_NUMBER from the Trucks sheet (deterministic).
    - assigned_truck:= ASSIGNED_PUNIT or DEFAULT_PUNIT when present, else falls
                       back to the allocated truck_id so the field is always
                       populated for seed data.
* Driver STATUS -> dashboard TruckStatusType:
      AVAIL / YARD                              -> "DOCKED_WAITING"
      ASSGN/DISP/DEPSHIP/DEPCONS/ARRSHIP/...    -> "IN_TRANSIT"
      VACATION / OFF / UNAVL                    -> "OFF_DUTY"
* Detention billing mirrors the frontend rule (src/lib/config.ts):
  first 120 minutes free, then CAD 75.00 / hour, prorated per minute.

Run:
    python scripts/ingest_hackathon_data.py
=================================================================
"""

from __future__ import annotations

import datetime
import json
import os
import sys
from typing import Any, Iterable

import openpyxl  # only dependency; openpyxl==3.1.5 is installed in this project

# --------------------------------------------------------------------------- #
# Paths (resolved relative to this script so CWD does not matter)
# --------------------------------------------------------------------------- #
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
SOURCE_XLSX = os.path.join(PROJECT_ROOT, "1788655393951_Hackathon_Data.xlsx")
OUTPUT_JSON = os.path.join(
    PROJECT_ROOT, "frontend", "src", "lib", "hackathonSeedData.json"
)

# --------------------------------------------------------------------------- #
# Domain constants
# --------------------------------------------------------------------------- #
# Southern Ontario operating bounding box used to filter live driver positions.
SO_LAT_MIN, SO_LAT_MAX = 42.0, 45.0
SO_LNG_MIN, SO_LNG_MAX = -82.0, -78.0

# Detention billing rule (mirrors frontend/src/lib/config.ts).
FREE_DETENTION_MINUTES = 120
DETENTION_RATE_PER_HOUR = 75.0

# How many records to seed per section.
TRUCK_COUNT = 10
LOAD_COUNT = 15
DETENTION_COUNT = 30

# Sentinel used by the TMS export for NULL cells.
NULL_TOKEN = "<null>"


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def clean(value: Any) -> Any:
    """Normalise a raw cell value: map "<null>"/empty/None to JSON null."""
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip()
        if v == "" or v.lower() == NULL_TOKEN:
            return None
        return v
    return value


def to_iso(value: Any) -> str | None:
    """Convert a datetime cell to an ISO-8601 string (or null)."""
    value = clean(value)
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    if isinstance(value, datetime.date):
        return datetime.datetime(value.year, value.month, value.day).isoformat()
    if isinstance(value, str):
        return value  # already a string timestamp
    return None


def round_coord(value: float) -> float:
    return round(value, 6)


def parse_dms(value: Any) -> float | None:
    """
    Parse a packed DMS coordinate such as '0433201N' or '0795300W' into signed
    decimal degrees.

    Layout: <DDMMSS><H> where H in {N,S,E,W}. Degrees occupy everything before
    the trailing 4 chars (MMSS). The result is negative for S/W.

    >>> parse_dms("0433201N")
    43.533611
    >>> parse_dms("0795300W")
    -79.883333
    """
    value = clean(value)
    if value is None or not isinstance(value, str):
        return None
    s = value.upper()
    if len(s) < 5 or s[-1] not in "NSEW":
        return None
    body = s[:-1]
    if not body.isdigit() or len(body) < 4:
        return None
    deg = int(body[:-4])
    minutes = int(body[-4:-2])
    seconds = int(body[-2:])
    decimal = deg + minutes / 60.0 + seconds / 3600.0
    if s[-1] in ("S", "W"):
        decimal = -decimal
    # GPS decimal degrees to 6 places (~0.1 m) â€” keeps the value stable & clean.
    return round(decimal, 6)


def in_southern_ontario(lat: float | None, lng: float | None) -> bool:
    """True when a decimal coordinate sits inside the Southern Ontario bounds."""
    if lat is None or lng is None:
        return False
    return SO_LAT_MIN <= lat <= SO_LAT_MAX and SO_LNG_MIN <= lng <= SO_LNG_MAX


def map_status(raw_status: Any, current_duty: Any) -> str:
    """
    Map the carrier's free-text driver STATUS onto the dashboard's three
    TruckStatusType values: IN_TRANSIT | DOCKED_WAITING | OFF_DUTY.
    `current_duty` is accepted for API symmetry / future enrichment.
    """
    status = clean(raw_status)
    if status is None:
        return "DOCKED_WAITING"  # safe default for an unknown/idle driver
    s = str(status).upper()
    if s in ("VACATION", "OFF", "UNAVL"):
        return "OFF_DUTY"
    if s in ("AVAIL", "YARD"):
        return "DOCKED_WAITING"
    # Anything else (ASSGN, DISP, DEPSHIP, DEPCONS, ARRSHIP, ARRCONS, PICKD...)
    # is an actively moving / dispatched driver.
    return "IN_TRANSIT"


def compute_billable(total_minutes: int | None) -> int:
    """Billable minutes = max(0, total - 120 free)."""
    if total_minutes is None or total_minutes < 0:
        return 0
    return max(0, total_minutes - FREE_DETENTION_MINUTES)


def compute_fee(billable_minutes: int) -> float:
    """Detention fee in CAD: billable minutes / 60 * 75, rounded to 2 dp."""
    return round((billable_minutes / 60.0) * DETENTION_RATE_PER_HOUR, 2)


def column_index(headers: list[Any], name: str) -> int | None:
    """Find the 0-based index of a (case-insensitive) header."""
    target = name.strip().upper()
    for i, h in enumerate(headers):
        if str(h).strip().upper() == target:
            return i
    return None


def index_map(headers: list[Any], names: Iterable[str]) -> dict[str, int | None]:
    return {name: column_index(headers, name) for name in names}


def cell(row: tuple[Any, ...], idx: int | None) -> Any:
    """Safely fetch a cell from a row by header index."""
    if idx is None:
        return None
    return row[idx] if idx < len(row) else None


def read_sheet(wb: openpyxl.Workbook, sheet_name: str) -> tuple[list[Any], list[tuple[Any, ...]]]:
    """Return (headers, data_rows) for a sheet, streaming read-only."""
    ws = wb[sheet_name]
    rows = ws.iter_rows(values_only=True)
    headers = list(next(rows, []))
    data = [r for r in rows if r is not None]
    return headers, data


# --------------------------------------------------------------------------- #
# 1. Drivers: parse DMS, filter to Southern Ontario
# --------------------------------------------------------------------------- #
def load_drivers(wb: openpyxl.Workbook) -> list[dict[str, Any]]:
    headers, rows = read_sheet(wb, "Driver")
    idx = index_map(
        headers,
        [
            "DRIVER_ID", "FIRST_NAME", "POSLAT", "POSLONG",
            "REMAINING_HOURS_CAN_7", "ASSIGNED_PUNIT", "DEFAULT_PUNIT",
            "STATUS", "ACTIVE_IN_DISP", "CURRENT_DUTY", "HOME_ZONE",
        ],
    )
    drivers: list[dict[str, Any]] = []
    for r in rows:
        lat = parse_dms(cell(r, idx["POSLAT"]))
        lng = parse_dms(cell(r, idx["POSLONG"]))
        if not in_southern_ontario(lat, lng):
            continue
        hos = clean(cell(r, idx["REMAINING_HOURS_CAN_7"]))
        if hos is None:
            continue  # need HOS for an operational truck
        active = clean(cell(r, idx["ACTIVE_IN_DISP"]))
        if active is not True and str(active).upper() not in ("TRUE", "1"):
            continue  # only drivers currently active in dispatch
        punit = clean(cell(r, idx["ASSIGNED_PUNIT"]))
        if punit is None:
            punit = clean(cell(r, idx["DEFAULT_PUNIT"]))
        drivers.append({
            "driver_id": clean(cell(r, idx["DRIVER_ID"])),
            "driver_name": clean(cell(r, idx["FIRST_NAME"])),
            "lat": round_coord(lat),  # type: ignore[arg-type]
            "lng": round_coord(lng),  # type: ignore[arg-type]
            "source_status": clean(cell(r, idx["STATUS"])),
            "current_duty": clean(cell(r, idx["CURRENT_DUTY"])),
            "hos_remaining_hours": hos,
            "assigned_punit": punit,
            "home_zone": clean(cell(r, idx["HOME_ZONE"])),
        })
    return drivers


# --------------------------------------------------------------------------- #
# 2. Trucks: flat list of real TRUCK_NUMBERs
# --------------------------------------------------------------------------- #
def load_truck_numbers(wb: openpyxl.Workbook) -> list[str]:
    headers, rows = read_sheet(wb, "Trucks")
    trucks: list[str] = []
    for r in rows:
        num = clean(cell(r, 0))  # only column is TRUCK_NUMBER
        if num is None:
            continue
        trucks.append(str(num))
    return trucks


# --------------------------------------------------------------------------- #
# 3. Join Drivers + Trucks -> 10 operational trucks
# --------------------------------------------------------------------------- #
def build_trucks(drivers: list[dict[str, Any]], truck_numbers: list[str]) -> list[dict[str, Any]]:
    """
    Join Southern-Ontario drivers to real TRUCK_NUMBERs.

    The Driver and Trucks sheets share no foreign key, but a driver's
    ASSIGNED_PUNIT / DEFAULT_PUNIT sometimes carries a real TRUCK_NUMBER
    (e.g. "B3339"). Allocation strategy (deterministic, unique truck_ids):

      1. Reserve each selected driver's source power-unit when it is a valid,
         still-unused TRUCK_NUMBER -> that becomes the truck_id.
      2. Allocate remaining drivers the next unused truck number from the
         Trucks sheet, in source order.

    `assigned_truck` honours the source power-unit value when present (it may be
    a real truck id or a zone code); otherwise it falls back to the allocated
    truck_id so the field is always populated.
    """
    selected = sorted(
        drivers, key=lambda d: (d["driver_id"] is None, d["driver_id"])
    )[:TRUCK_COUNT]
    valid_trucks = set(truck_numbers)

    # 1. Reserve real assigned trucks from the source power-unit field.
    reserved: dict[int, str | None] = {}
    used: set[str] = set()
    for i, drv in enumerate(selected):
        punit = drv["assigned_punit"]
        if punit and punit in valid_trucks and punit not in used:
            reserved[i] = punit
            used.add(punit)
        else:
            reserved[i] = None

    # 2. Allocate the rest from the truck list in source order.
    pool = iter(t for t in truck_numbers if t not in used)
    trucks: list[dict[str, Any]] = []
    for i, drv in enumerate(selected):
        truck_id = reserved[i] or next(pool, f"TRK-{drv['driver_id']}")
        punit = drv["assigned_punit"]
        assigned_truck = punit if punit else truck_id
        status = map_status(drv["source_status"], drv["current_duty"])
        trucks.append({
            "truck_id": truck_id,
            "driver_id": drv["driver_id"],
            "driver_name": drv["driver_name"],
            "lat": drv["lat"],
            "lng": drv["lng"],
            "status": status,
            "source_status": drv["source_status"],
            "hos_remaining_hours": drv["hos_remaining_hours"],
            "assigned_truck": assigned_truck,
            "home_zone": drv["home_zone"],
        })
    return trucks


# --------------------------------------------------------------------------- #
# 4. Loads: 15 representative Ontario regional loads (Tlorder)
# --------------------------------------------------------------------------- #
def load_customer_loads(wb: openpyxl.Workbook) -> list[dict[str, Any]]:
    headers, rows = read_sheet(wb, "Tlorder")
    idx = index_map(
        headers,
        [
            "BILL_NUMBER", "CALLNAME", "ORIGCITY", "ORIGPROV",
            "DESTCITY", "DESTPROV", "LOAD_TYPE", "LOAD_DESCRIPTION",
            "WEIGHT_LBS", "PALLETS", "TEMP_CONTROLLED", "TEMPERATURE",
        ],
    )
    loads: list[dict[str, Any]] = []
    seen_bills: set[Any] = set()
    for r in rows:
        orig_prov = clean(cell(r, idx["ORIGPROV"]))
        dest_prov = clean(cell(r, idx["DESTPROV"]))
        # Representative Ontario *regional* loads: both ends inside ON.
        if orig_prov != "ON" or dest_prov != "ON":
            continue
        bill = clean(cell(r, idx["BILL_NUMBER"]))
        if bill is None or bill in seen_bills:
            continue
        seen_bills.add(bill)
        weight = clean(cell(r, idx["WEIGHT_LBS"]))
        pallets = clean(cell(r, idx["PALLETS"]))
        temp_controlled = clean(cell(r, idx["TEMP_CONTROLLED"]))
        loads.append({
            "bill_number": bill,
            "customer": clean(cell(r, idx["CALLNAME"])),
            "origin": clean(cell(r, idx["ORIGCITY"])),
            "destination": clean(cell(r, idx["DESTCITY"])),
            "load_type": clean(cell(r, idx["LOAD_TYPE"])),
            "load_description": clean(cell(r, idx["LOAD_DESCRIPTION"])),
            "weight_lbs": int(weight) if isinstance(weight, (int, float)) else None,
            "pallets": int(pallets) if isinstance(pallets, (int, float)) else None,
            "temp_controlled": bool(temp_controlled) if isinstance(temp_controlled, bool) else False,
            "temperature": clean(cell(r, idx["TEMPERATURE"])),
        })
        if len(loads) >= LOAD_COUNT:
            break
    return loads


# --------------------------------------------------------------------------- #
# 5. Detention events: historical dock sessions from Dispatch
# --------------------------------------------------------------------------- #
def load_detention_events(wb: openpyxl.Workbook) -> list[dict[str, Any]]:
    """
    Mine the Dispatch sheet for rows where a detention arrival timestamp is
    populated (LS_DET_PICK_ARRIVE and/or LS_DET_DELV_ARRIVE). Each deduped
    freight/leg becomes one historical dock detention session.

    Rows with BOTH timestamps are preferred because they yield a real detention
    window duration (delivery arrival - pickup arrival); the billable minutes
    and fee are derived with the dashboard's 120-min-free / $75-hr rule.
    """
    headers, rows = read_sheet(wb, "Dispatch")
    idx = index_map(
        headers,
        [
            "NAME", "TRIP_NUMBER", "LS_FREIGHT", "LS_DET_PICK_ARRIVE",
            "LS_DET_DELV_ARRIVE", "LS_LEG_STAT", "STATUS", "ORIG_ZONE_DESC",
            "DEST_ZONE_DESC", "LOAD_TYPE", "WEIGHT_LBS", "PALLETS",
            "LS_TEMP_CONTROLLED",
        ],
    )

    def minutes_between(a: datetime.datetime, b: datetime.datetime) -> int | None:
        total = int((b - a).total_seconds() // 60)
        return total if total >= 0 else None

    both: list[dict[str, Any]] = []
    single: list[dict[str, Any]] = []
    seen: set[tuple] = set()

    for r in rows:
        pick = clean(cell(r, idx["LS_DET_PICK_ARRIVE"]))
        delv = clean(cell(r, idx["LS_DET_DELV_ARRIVE"]))
        if pick is None and delv is None:
            continue
        name = clean(cell(r, idx["NAME"]))
        trip = clean(cell(r, idx["TRIP_NUMBER"]))
        freight = clean(cell(r, idx["LS_FREIGHT"]))
        key = (name, trip, freight, to_iso(pick), to_iso(delv))
        if key in seen:
            continue
        seen.add(key)

        dock_minutes: int | None = None
        if isinstance(pick, datetime.datetime) and isinstance(delv, datetime.datetime):
            dock_minutes = minutes_between(pick, delv)

        weight = clean(cell(r, idx["WEIGHT_LBS"]))
        pallets = clean(cell(r, idx["PALLETS"]))
        tc = clean(cell(r, idx["LS_TEMP_CONTROLLED"]))
        event = {
            "session_id": f"DET-{len(both) + len(single) + 1:04d}",
            "driver_name": name,
            "trip_number": trip,
            "freight": freight,
            "pickup_arrival": to_iso(pick),
            "delivery_arrival": to_iso(delv),
            "origin_zone": clean(cell(r, idx["ORIG_ZONE_DESC"])),
            "destination_zone": clean(cell(r, idx["DEST_ZONE_DESC"])),
            "leg_status": clean(cell(r, idx["LS_LEG_STAT"])),
            "dispatch_status": clean(cell(r, idx["STATUS"])),
            "load_type": clean(cell(r, idx["LOAD_TYPE"])),
            "weight_lbs": int(weight) if isinstance(weight, (int, float)) else None,
            "pallets": int(pallets) if isinstance(pallets, (int, float)) else None,
            "temp_controlled": bool(tc) if isinstance(tc, bool) else False,
            "dock_minutes": dock_minutes,
        }
        if dock_minutes is not None:
            billable = compute_billable(dock_minutes)
            event["billable_detention_minutes"] = billable
            event["detention_fee_owed"] = compute_fee(billable)
            both.append(event)
        else:
            single.append(event)

    # Prefer sessions with a computable window; top up with single-timestamp
    # sessions if not enough complete ones exist.
    both.sort(key=lambda e: (e["pickup_arrival"] or "", e["driver_name"] or ""))
    single.sort(
        key=lambda e: (e["pickup_arrival"] or e["delivery_arrival"] or "", e["driver_name"] or "")
    )
    events = (both + single)[:DETENTION_COUNT]
    # Re-number session ids sequentially after final selection.
    for i, e in enumerate(events, start=1):
        e["session_id"] = f"DET-{i:04d}"
    return events


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def main() -> int:
    if not os.path.isfile(SOURCE_XLSX):
        print(f"ERROR: source workbook not found at {SOURCE_XLSX}", file=sys.stderr)
        return 1

    print(f"Loading workbook: {SOURCE_XLSX}")
    wb = openpyxl.load_workbook(SOURCE_XLSX, read_only=True, data_only=True)

    drivers = load_drivers(wb)
    truck_numbers = load_truck_numbers(wb)
    trucks = build_trucks(drivers, truck_numbers)
    loads = load_customer_loads(wb)
    detention_events = load_detention_events(wb)

    wb.close()

    payload = {
        "metadata": {
            "generated_at": datetime.datetime.now().isoformat(),
            "source_file": os.path.basename(SOURCE_XLSX),
            "description": (
                "Cleaned seed data for the Apex Corridor Systems "
                "Dashboard, derived from the carrier TMS export. See the "
                "ingestion script (scripts/ingest_hackathon_data.py) for the "
                "parsing rules and documented data assumptions."
            ),
            "operating_bounds": {
                "lat": [SO_LAT_MIN, SO_LAT_MAX],
                "lng": [SO_LNG_MIN, SO_LNG_MAX],
            },
            "detention_rule": {
                "free_minutes": FREE_DETENTION_MINUTES,
                "rate_per_hour_cad": DETENTION_RATE_PER_HOUR,
            },
            "counts": {
                "trucks": len(trucks),
                "loads": len(loads),
                "detention_events": len(detention_events),
            },
        },
        "trucks": trucks,
        "loads": loads,
        "detention_events": detention_events,
    }

    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    print("\nIngestion complete.")
    print(f"  Drivers in Southern Ontario (active in dispatch): {len(drivers)}")
    print(f"  Real truck numbers available:                    {len(truck_numbers)}")
    print(f"  Trucks seeded:                                   {len(trucks)}")
    print(f"  Ontario regional loads seeded:                   {len(loads)}")
    print(f"  Detention events seeded:                         {len(detention_events)}")
    print(f"\nWrote: {OUTPUT_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
