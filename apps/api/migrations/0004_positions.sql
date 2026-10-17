-- Migration 0004: mô hình Chức vụ (D-09, 17/10/2026).
-- Phân biệt Vai trò hệ thống (7 role, chỉ phân quyền) với Chức vụ (thủ kho, thủ quỹ...)
-- gắn vào từng bước: performer_position_ids_json + supervisor_position_ids_json.
-- Dọn sạch model cũ ở bước: BỎ cột role / roles_json / supervisor_roles_json (0003)
-- bằng cách rebuild bảng process_steps (dữ liệu demo, đã được duyệt dọn gọn).
-- Giữ nguyên: PK, FK version_id, UNIQUE(version_id, code), index idx_steps_version,
-- CHECK failure_policy. Bảng review_comments.step_id REFERENCES process_steps(id)
-- được giữ nguyên (rebuild cùng tên bảng).

-- 1. Bảng chức vụ + gán user–chức vụ (UI checkbox thuộc T7).
CREATE TABLE positions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  org_unit_id TEXT NULL REFERENCES org_units(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE user_positions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, position_id)
);
CREATE INDEX idx_user_positions_position ON user_positions(position_id);

-- 2. Rebuild process_steps.
CREATE TABLE process_steps_new (
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
  required INTEGER NOT NULL DEFAULT 1,
  target_duration_min INTEGER,
  warnings TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completion_json TEXT NOT NULL DEFAULT '[]',
  skip_json TEXT NOT NULL DEFAULT '{"allowed":false,"allowedRoles":[],"reasonRequired":true,"approvalLevel":null}',
  failure_policy TEXT NOT NULL DEFAULT 'STOP'
    CHECK (failure_policy IN ('STOP','RETRY','ESCALATE','CANCEL')),
  performer_position_ids_json TEXT NOT NULL DEFAULT '[]',
  supervisor_position_ids_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE (version_id, code)
);

INSERT INTO process_steps_new (
  id, version_id, code, title, prerequisites, inputs, instructions,
  expected_result, outputs, notes, required, target_duration_min, warnings,
  sort_order, completion_json, skip_json, failure_policy,
  performer_position_ids_json, supervisor_position_ids_json
)
SELECT
  id, version_id, code, title, prerequisites, inputs, instructions,
  expected_result, outputs, notes, required, target_duration_min, warnings,
  sort_order, completion_json, skip_json, failure_policy,
  '[]', '[]'
FROM process_steps;

DROP TABLE process_steps;
ALTER TABLE process_steps_new RENAME TO process_steps;
CREATE INDEX idx_steps_version ON process_steps(version_id, sort_order);
