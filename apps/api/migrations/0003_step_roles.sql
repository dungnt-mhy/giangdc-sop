-- Migration 0003: vai trò thực hiện + giám sát của bước dạng nhiều chọn (theo yêu cầu chủ sản phẩm 17/10/2026).
-- roles_json: mảng vai trò thực hiện; supervisor_roles_json: mảng vai trò giám sát.
-- Cột role cũ giữ nguyên để tương thích đọc; backfill roles_json từ role cũ.

ALTER TABLE process_steps ADD COLUMN roles_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE process_steps ADD COLUMN supervisor_roles_json TEXT NOT NULL DEFAULT '[]';

UPDATE process_steps
SET roles_json = json_array(role)
WHERE role IS NOT NULL AND trim(role) <> '';
