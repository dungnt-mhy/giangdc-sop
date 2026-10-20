-- 0017: Bổ sung trường quản trị cho org_units / positions / roles / users (D-28).
-- Tất cả bằng ADD COLUMN (an toàn trên D1, tránh rebuild bảng có FK).
-- LƯU Ý: REST API của D1 chặn ADD COLUMN ... NOT NULL DEFAULT (403) —
-- các cột timestamp thêm dạng TEXT nullable, backfill ngay sau đó;
-- API ghi giá trị tường minh khi INSERT/UPDATE.

-- Đơn vị: mã, địa chỉ, điện thoại, người phụ trách, trạng thái dùng.
ALTER TABLE org_units ADD COLUMN code TEXT;
ALTER TABLE org_units ADD COLUMN address TEXT;
ALTER TABLE org_units ADD COLUMN phone TEXT;
ALTER TABLE org_units ADD COLUMN manager_user_id TEXT REFERENCES users(id);
ALTER TABLE org_units ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX idx_org_units_code ON org_units(code) WHERE code IS NOT NULL;
ALTER TABLE org_units ADD COLUMN created_at TEXT;
ALTER TABLE org_units ADD COLUMN updated_at TEXT;
UPDATE org_units SET created_at = '2026-10-20T00:00:00Z', updated_at = '2026-10-20T00:00:00Z' WHERE created_at IS NULL;

-- Chức vụ: mô tả, trạng thái dùng, mốc cập nhật.
ALTER TABLE positions ADD COLUMN description TEXT;
ALTER TABLE positions ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE positions ADD COLUMN updated_at TEXT;
UPDATE positions SET updated_at = created_at WHERE updated_at IS NULL;

-- Vai trò: mô tả, cờ hệ thống (không được xóa), mốc cập nhật.
ALTER TABLE roles ADD COLUMN description TEXT;
ALTER TABLE roles ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;
ALTER TABLE roles ADD COLUMN updated_at TEXT;
UPDATE roles SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE roles SET is_system = 1 WHERE code = 'ADMIN';

-- Người dùng: email, điện thoại, lần đăng nhập cuối, mốc cập nhật.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;
UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;
