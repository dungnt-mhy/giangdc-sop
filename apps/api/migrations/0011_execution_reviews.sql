-- Migration 0011: D-18 — nhật ký duyệt lượt thực hiện + cột started_at.
-- (1) bảng execution_reviews: lưu vết mỗi lần Báo hoàn thành / Xác nhận hoàn thành /
--     Từ chối xác nhận / Hủy báo hoàn thành (người làm, thời gian, lý do).
--     Trước D-18, lý do từ chối chỉ lưu đè lên executions.approval_note nên không có lịch sử.
-- (2) executions: thêm started_at (thời điểm bấm Bắt đầu) để hiện "Bắt đầu lúc".

CREATE TABLE IF NOT EXISTS execution_reviews (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('submit','approve','reject','cancel_submit')),
  actor_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_execution_reviews_execution ON execution_reviews(execution_id, created_at DESC);

ALTER TABLE executions ADD COLUMN started_at TEXT;
