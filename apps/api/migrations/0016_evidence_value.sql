-- Migration 0016: T4 — bằng chứng phi tệp (FIELD/FORM/CONFIRM/SCAN/NOTE, PRC-006).
-- Thêm cột value_text để lưu giá trị nhập liệu (JSON cho FORM, text thuần cho các loại khác).
-- Các cột file (r2_key, file_name, mime_type, size_bytes) để trống ('') với loại phi tệp.

ALTER TABLE evidence ADD COLUMN value_text TEXT;
