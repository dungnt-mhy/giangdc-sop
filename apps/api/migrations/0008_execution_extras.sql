-- Migration 0008: D-14 — trường mở rộng cho Lượt thực hiện (form tạo đơn giản).
-- Thêm: tiêu đề, ngày/giờ thực hiện, ca làm việc, người thực hiện chính, người giám sát.
-- Tất cả nullable để tương thích các lượt đã tạo trước đó (T3).

ALTER TABLE executions ADD COLUMN title TEXT;
ALTER TABLE executions ADD COLUMN execution_date TEXT;
ALTER TABLE executions ADD COLUMN execution_time TEXT;
ALTER TABLE executions ADD COLUMN shift TEXT;
ALTER TABLE executions ADD COLUMN main_performer_id TEXT REFERENCES users(id);
ALTER TABLE executions ADD COLUMN supervisor_id TEXT REFERENCES users(id);
