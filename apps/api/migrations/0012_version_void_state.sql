-- Migration 0012: D-20 — cờ "Đã hủy" cho phiên bản (D-20b: flag thay vì state VOID).
-- Lý do: D1 qua REST API không rebuild được bảng có FK (mỗi /query là connection
-- riêng nên PRAGMA foreign_keys=OFF vô hiệu; RENAME TABLE tự cập nhật REFERENCES
-- của 4 bảng con; PRAGMA writable_schema bị chặn SQLITE_AUTH; DROP parent bị FK
-- chặn). Vì vậy KHÔNG thêm 'VOID' vào CHECK constraint của state; thay vào đó
-- dùng 2 cột mới: version đã hủy <=> voided_at IS NOT NULL (đóng băng mọi
-- transition, 409 VERSION_VOIDED; UI suy badge "Đã hủy" từ flag).
ALTER TABLE process_versions ADD COLUMN voided_at TEXT;
ALTER TABLE process_versions ADD COLUMN void_reason TEXT;
