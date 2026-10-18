-- Migration 0014: T5 — Ngoại lệ & làm lại (EXP-001..006).
-- Bảng exceptions: mỗi lần "Không đạt" tạo 1 bản ghi gắn với bước + snapshot.
-- Mức độ: LOW/MEDIUM/HIGH/BLOCKING (EXP-002); chỉ BLOCKING tự động chặn lượt.
-- Giám sát xử lý: làm lại / tiếp tục có điều kiện / hủy / leo thang (EXP-003).
-- Làm lại giữ attempt cũ (attempt_no tăng), idempotent khi start lại (EXP-004).
-- Đóng ngoại lệ cần mô tả khắc phục + bằng chứng nếu quy tắc yêu cầu (EXP-005).

CREATE TABLE IF NOT EXISTS exceptions (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  execution_step_id TEXT NOT NULL REFERENCES execution_steps(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','BLOCKING')),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','IN_REMEDIATION','RESOLVED','CONDITIONAL_CONTINUE','ESCALATED','CANCELLED')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  -- EXP-001: snapshot dữ liệu tại thời điểm phát hiện (JSON).
  snapshot_json TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- EXP-003: xử lý bởi giám sát.
  handled_by TEXT REFERENCES users(id),
  handled_at TEXT,
  handle_action TEXT CHECK (handle_action IN ('REWORK','CONDITIONAL_CONTINUE','CANCEL','ESCALATE')),
  handle_note TEXT,
  -- EXP-005: đóng ngoại lệ.
  resolution TEXT,
  resolved_by TEXT REFERENCES users(id),
  resolved_at TEXT,
  -- EXP-003: leo thang.
  escalated_to TEXT REFERENCES users(id),
  escalated_at TEXT,
  escalate_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_exceptions_exec ON exceptions(execution_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_step ON exceptions(execution_step_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_status ON exceptions(status);
CREATE INDEX IF NOT EXISTS idx_exceptions_severity ON exceptions(severity);

-- EXP-004: số lần thử của bước (tăng khi làm lại, giữ lịch sử qua bảng exceptions).
ALTER TABLE execution_steps ADD COLUMN attempt_no INTEGER NOT NULL DEFAULT 1;
