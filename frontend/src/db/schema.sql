-- =============================================================================
-- Apex Corridor Systems — Dispatcher schema
-- Target: PostgreSQL 14+
--
-- This DDL mirrors the TypeScript domain models in src/lib/types.ts:
--   facilities       -> Facility   (geofences)
--   truck_status     -> TruckStatus (live current state of each tractor)
--   detention_logs   -> DetentionLog (one row per dock visit)
--   loads            -> Load
--
-- The FTL detention rule (first 120 minutes free) is enforced at the database
-- level via GENERATED columns so billing can never drift from the rule:
--   billable_detention_minutes = GREATEST(0, total_dock_minutes - 120)
-- =============================================================================

CREATE TABLE facilities (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  radius        INTEGER NOT NULL,              -- metres (circular geofence)
  type          TEXT NOT NULL CHECK (type IN ('HUB','CUSTOMER_DOCK','TERMINAL')),
  address       TEXT NOT NULL,
  customer      TEXT NOT NULL,
  polygon       JSONB,                         -- optional polygonal geofence [{lat,lng},...]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE truck_status (
  id                   TEXT PRIMARY KEY,
  truck_number         TEXT NOT NULL UNIQUE,
  driver_name          TEXT NOT NULL,
  lat                  DOUBLE PRECISION NOT NULL,
  lng                  DOUBLE PRECISION NOT NULL,
  speed                DOUBLE PRECISION NOT NULL DEFAULT 0,  -- km/h
  odometer             DOUBLE PRECISION NOT NULL DEFAULT 0, -- km
  heading              DOUBLE PRECISION NOT NULL DEFAULT 0,  -- degrees
  current_status       TEXT NOT NULL CHECK (current_status IN ('IN_TRANSIT','DOCKED_WAITING','OFF_DUTY')),
  current_facility_id  TEXT REFERENCES facilities(id),
  dock_arrival_time    TIMESTAMPTZ,                           -- set when truck enters a geofence
  assigned_load_id     TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_truck_status_facility ON truck_status(current_facility_id);
CREATE INDEX idx_truck_status_status   ON truck_status(current_status);

CREATE TABLE loads (
  id                      TEXT PRIMARY KEY,
  truck_id                TEXT REFERENCES truck_status(id),
  customer                TEXT NOT NULL,
  origin_facility_id      TEXT NOT NULL REFERENCES facilities(id),
  destination_facility_id TEXT NOT NULL REFERENCES facilities(id),
  commodity               TEXT NOT NULL,
  weight_kg               INTEGER NOT NULL,
  pickup_time             TIMESTAMPTZ NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('ASSIGNED','IN_TRANSIT','DELIVERED','PENDING')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE detention_logs (
  id                          TEXT PRIMARY KEY,
  load_id                     TEXT NOT NULL REFERENCES loads(id),
  truck_id                    TEXT NOT NULL REFERENCES truck_status(id),
  facility_id                 TEXT NOT NULL REFERENCES facilities(id),
  arrival_time                TIMESTAMPTZ NOT NULL,
  departure_time              TIMESTAMPTZ,                      -- NULL = still docked (ACTIVE)
  total_dock_minutes          INTEGER NOT NULL DEFAULT 0,
  -- FTL rule: first 120 minutes free. Billable = max(0, total - 120).
  billable_detention_minutes  INTEGER GENERATED ALWAYS AS (GREATEST(0, total_dock_minutes - 120)) STORED,
  -- Detention fee = billable minutes / 60 * rate. Rate stored per row for auditability.
  detention_rate_per_hour     NUMERIC(10,2) NOT NULL DEFAULT 75.00,
  detention_fee_owed          NUMERIC(10,2) GENERATED ALWAYS AS (ROUND((GREATEST(0, total_dock_minutes - 120)::NUMERIC / 60.0 * detention_rate_per_hour), 2)) STORED,
  status                      TEXT NOT NULL CHECK (status IN ('ACTIVE','CLOSED')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_detention_truck    ON detention_logs(truck_id);
CREATE INDEX idx_detention_facility ON detention_logs(facility_id);
CREATE INDEX idx_detention_status   ON detention_logs(status);

-- -----------------------------------------------------------------------------
-- Active dock sessions are derived in real time from truck_status:
--   when current_status = 'DOCKED_WAITING' and current_facility_id is a
--   customer dock/terminal, an ACTIVE detention_logs row exists whose
--   total_dock_minutes ticks up against now() until departure_time is set.
--   (See src/lib/simulation.ts::activeLogFromTruck for the projection.)
-- -----------------------------------------------------------------------------
