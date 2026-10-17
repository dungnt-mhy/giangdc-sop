-- Migration 0007: Lượt thực hiện + bước lượt + bằng chứng (T3, D-12).
-- EXE-001..013 (phạm vi D-12), EVD-001..013 (phạm vi D-12: ảnh chụp).

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  process_id TEXT NOT NULL REFERENCES processes(id),
  version_id TEXT NOT NULL REFERENCES process_versions(id),
  state TEXT NOT NULL DEFAULT 'CREATED'
    CHECK (state IN ('CREATED','IN_PROGRESS','PAUSED','BLOCKED','COMPLETED','CANCELLED')),
  org_unit_id TEXT REFERENCES org_units(id),
  note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_executions_org ON executions(org_unit_id);
CREATE INDEX IF NOT EXISTS idx_executions_state ON executions(state);
CREATE INDEX IF NOT EXISTS idx_executions_created ON executions(created_at DESC);

-- Snapshot bước tại lúc tạo lượt (nội dung version có thể đổi sau, lượt giữ nguyên).
CREATE TABLE IF NOT EXISTS execution_steps (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  version_step_id TEXT,
  step_code TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING','IN_PROGRESS','DONE')),
  required INTEGER NOT NULL DEFAULT 1,
  performer_user_id TEXT REFERENCES users(id),
  supervisor_user_id TEXT REFERENCES users(id),
  completion_json TEXT NOT NULL DEFAULT '[]',
  skip_json TEXT NOT NULL DEFAULT '{"allowed":false,"allowedPositions":[],"reasonRequired":true,"approvalLevel":null}',
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(execution_id, step_code)
);
CREATE INDEX IF NOT EXISTS idx_exsteps_exec ON execution_steps(execution_id);
CREATE INDEX IF NOT EXISTS idx_exsteps_performer ON execution_steps(performer_user_id);

-- Bằng chứng gắn với bước của lượt (D-12: ảnh chụp; các loại khác theo PRC-006).
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  execution_step_id TEXT NOT NULL REFERENCES execution_steps(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_step ON evidence(execution_step_id);
CREATE INDEX IF NOT EXISTS idx_evidence_exec ON evidence(execution_id);
