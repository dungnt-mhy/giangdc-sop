-- Migration 0001: identity & access (T1.2)
-- SRS v1.6 §11.1 (nhóm "Danh tính và truy cập"), OPEN-SCOPE-01, OPEN-SOD-01.

CREATE TABLE org_units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ORG','OFFICE','WAREHOUSE')),
  parent_id TEXT REFERENCES org_units(id)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LOCKED','DISABLED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE user_system_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','approver','author','reviewer','supervisor','viewer')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE user_scopes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_unit_id TEXT NOT NULL REFERENCES org_units(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, org_unit_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Audit tối thiểu cho T1.2: đăng nhập/đăng xuất, tự phê duyệt (gắn cờ), thay đổi phân quyền.
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  object_type TEXT,
  object_id TEXT,
  reason TEXT,
  flagged INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_audit_actor ON audit_events(actor_id);
CREATE INDEX idx_audit_created ON audit_events(created_at);
