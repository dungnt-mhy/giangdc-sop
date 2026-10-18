-- Migration 0009: D-15 — duyệt lượt thực hiện + thông báo 2 chiều.
-- (1) executions: cột lưu vết duyệt (người gửi duyệt / người duyệt / thời điểm / ghi chú).
-- (2) bảng notifications: thông báo trong app (chuông + badge).

ALTER TABLE executions ADD COLUMN approval_requested_by TEXT REFERENCES users(id);
ALTER TABLE executions ADD COLUMN approval_requested_at TEXT;
ALTER TABLE executions ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE executions ADD COLUMN approved_at TEXT;
ALTER TABLE executions ADD COLUMN approval_note TEXT;

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  ref_type TEXT,
  ref_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
