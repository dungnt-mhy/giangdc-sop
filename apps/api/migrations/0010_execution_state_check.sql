-- Migration 0010: D-15 — mở rộng CHECK constraint state của executions.
-- Lý do: migration 0007 khóa state IN ('CREATED','IN_PROGRESS','PAUSED','BLOCKED','COMPLETED','CANCELLED');
-- D-15 thêm 'PENDING_APPROVAL' | 'APPROVED' ở domain nhưng SQLite không cho ALTER CHECK constraint,
-- nên rebuild bảng (giữ nguyên dữ liệu, FK, index).

PRAGMA foreign_keys=OFF;

CREATE TABLE executions_new (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  process_id TEXT NOT NULL REFERENCES processes(id),
  version_id TEXT NOT NULL REFERENCES process_versions(id),
  state TEXT NOT NULL DEFAULT 'CREATED'
    CHECK (state IN ('CREATED','IN_PROGRESS','PAUSED','BLOCKED','COMPLETED','CANCELLED','PENDING_APPROVAL','APPROVED')),
  org_unit_id TEXT REFERENCES org_units(id),
  note TEXT,
  title TEXT,
  execution_date TEXT,
  execution_time TEXT,
  shift TEXT,
  main_performer_id TEXT REFERENCES users(id),
  supervisor_id TEXT REFERENCES users(id),
  approval_requested_by TEXT REFERENCES users(id),
  approval_requested_at TEXT,
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  approval_note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO executions_new
  (id, code, process_id, version_id, state, org_unit_id, note,
   title, execution_date, execution_time, shift,
   main_performer_id, supervisor_id,
   approval_requested_by, approval_requested_at, approved_by, approved_at, approval_note,
   created_by, created_at, updated_at)
SELECT
  id, code, process_id, version_id, state, org_unit_id, note,
  title, execution_date, execution_time, shift,
  main_performer_id, supervisor_id,
  approval_requested_by, approval_requested_at, approved_by, approved_at, approval_note,
  created_by, created_at, updated_at
FROM executions;

DROP TABLE executions;

ALTER TABLE executions_new RENAME TO executions;

CREATE INDEX IF NOT EXISTS idx_executions_org ON executions(org_unit_id);
CREATE INDEX IF NOT EXISTS idx_executions_state ON executions(state);
CREATE INDEX IF NOT EXISTS idx_executions_created ON executions(created_at DESC);

PRAGMA foreign_keys=ON;
