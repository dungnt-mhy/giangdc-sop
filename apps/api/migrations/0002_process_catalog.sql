-- Migration 0002: process catalog + authoring & governance (T2)
-- SRS v1.6 §7.1 (vòng đời phiên bản), §7.5 (INVARIANT/CONTRACT),
-- PRC-001..009, GOV-001..007, BR-001/002/003/004/008/014, §12.2 (optimistic concurrency).

-- Danh mục quy trình (PRC-001). BR-002: không xóa vật lý -> dùng status ARCHIVED.
CREATE TABLE processes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,               -- BR-001: mã duy nhất toàn hệ thống
  name TEXT NOT NULL,
  purpose TEXT,
  scope TEXT,
  applicable_to TEXT,
  start_condition TEXT,
  end_condition TEXT,
  owner_id TEXT REFERENCES users(id),
  org_unit_id TEXT REFERENCES org_units(id),
  review_trigger TEXT,
  process_group TEXT NOT NULL DEFAULT 'GENERAL',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_processes_code ON processes(code);
CREATE INDEX idx_processes_group ON processes(process_group);
CREATE INDEX idx_processes_status ON processes(status);

-- Phiên bản quy trình (GOV-001..007). revision: optimistic concurrency (§12.2).
CREATE TABLE process_versions (
  id TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES processes(id),
  version_no INTEGER NOT NULL,             -- BR-001: duy nhất trong một quy trình
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN
    ('DRAFT','IN_REVIEW','APPROVED','SCHEDULED','ACTIVE','SUPERSEDED','RETIRED')),
  change_summary TEXT,                     -- BR-003: bắt buộc từ IN_REVIEW
  change_size TEXT CHECK (change_size IN ('MINOR','MAJOR')),
  impact_assessment TEXT,                  -- BR-003: bắt buộc khi MAJOR
  effective_from TEXT,                     -- GOV-005: phát hành theo lịch
  created_by TEXT REFERENCES users(id),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (process_id, version_no)
);
-- SRS §7.1: mỗi Process tối đa 1 ACTIVE + 1 SCHEDULED chưa kích hoạt.
-- Adapter cưỡng chế bằng partial unique index (AC-02).
CREATE UNIQUE INDEX idx_versions_one_active
  ON process_versions(process_id) WHERE state = 'ACTIVE';
CREATE UNIQUE INDEX idx_versions_one_scheduled
  ON process_versions(process_id) WHERE state = 'SCHEDULED';
CREATE INDEX idx_versions_process ON process_versions(process_id, state);

-- Bước quy trình: đủ 12 trường PRC-005 + cấu hình PRC-006/007/008.
-- completion_json / skip_json: schema JSON version hóa trong contract (§11.2).
CREATE TABLE process_steps (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES process_versions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  prerequisites TEXT,
  inputs TEXT,
  instructions TEXT,
  expected_result TEXT,
  outputs TEXT,
  notes TEXT,
  role TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  target_duration_min INTEGER,
  warnings TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completion_json TEXT NOT NULL DEFAULT '[]',
  skip_json TEXT NOT NULL DEFAULT '{"allowed":false,"allowedRoles":[],"reasonRequired":true,"approvalLevel":null}',
  failure_policy TEXT NOT NULL DEFAULT 'STOP'
    CHECK (failure_policy IN ('STOP','RETRY','ESCALATE','CANCEL')),
  UNIQUE (version_id, code)
);
CREATE INDEX idx_steps_version ON process_steps(version_id, sort_order);

-- Góp ý thẩm định theo toàn phiên bản hoặc từng bước (GOV-002).
CREATE TABLE review_comments (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES process_versions(id) ON DELETE CASCADE,
  step_id TEXT REFERENCES process_steps(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_comments_version ON review_comments(version_id);

-- Hồ sơ phê duyệt (GOV-004 + OPEN-SOD-01: lưu người/thời gian/vai trò/quyết định,
-- tự phê duyệt lưu vết + gắn cờ).
CREATE TABLE approval_records (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES process_versions(id) ON DELETE CASCADE,
  approver_id TEXT NOT NULL REFERENCES users(id),
  approver_role TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RETURNED')),
  reason TEXT,
  self_approved INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_approvals_version ON approval_records(version_id);

-- Idempotency cho mutation (BR-008/BR-014, SRS §12.2).
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  operation TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_idem_actor ON idempotency_keys(actor_id);
