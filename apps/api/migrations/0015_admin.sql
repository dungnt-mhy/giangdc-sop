-- Migration 0015: Danh mục lý do dùng chung (ADM-005, T7).
-- category: cancel (hủy lượt) | skip (bỏ qua bước) | fail (không đạt) | reject (từ chối).

CREATE TABLE reason_catalog (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('cancel','skip','fail','reject')),
  label TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_reason_category ON reason_catalog(category, is_active);

-- Seed lý do mẫu (demo).
INSERT INTO reason_catalog (id, code, category, label) VALUES
  ('rsn-cancel-001', 'CANCEL_PLAN_CHANGED',  'cancel', 'Thay đổi kế hoạch sản xuất'),
  ('rsn-cancel-002', 'CANCEL_DUPLICATE',     'cancel', 'Lượt trùng lặp'),
  ('rsn-cancel-003', 'CANCEL_RESOURCE_LACK', 'cancel', 'Thiếu nguồn lực thực hiện'),
  ('rsn-skip-001',   'SKIP_NOT_APPLICABLE',  'skip',   'Bước không áp dụng cho lô hàng này'),
  ('rsn-skip-002',   'SKIP_DONE_BEFORE',     'skip',   'Đã thực hiện ở lượt trước'),
  ('rsn-fail-001',   'FAIL_CRITERIA_MISS',   'fail',   'Không đạt tiêu chí kiểm tra'),
  ('rsn-fail-002',   'FAIL_EQUIP_BROKEN',    'fail',   'Thiết bị hỏng'),
  ('rsn-reject-001', 'REJECT_EVIDENCE_LACK', 'reject', 'Thiếu bằng chứng'),
  ('rsn-reject-002', 'REJECT_STEP_REDO',     'reject', 'Bước cần làm lại');
