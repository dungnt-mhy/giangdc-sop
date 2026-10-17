-- Migration 0005: Vai trò ứng dụng mở rộng (D-10).
-- Thay 7 vai trò cứng + bảng user_system_roles bằng 3 bảng: roles, role_permissions, user_roles.
-- 27 mã quyền (packages/domain/src/permissions.ts) giữ nguyên làm vốn từ vựng.

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  senior_approver INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id),
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

-- Seed 4 vai trò demo (D-10). Gói quyền suy từ ROLE_PERMISSIONS cũ (xem báo cáo).
INSERT INTO roles (id, code, name, senior_approver) VALUES
  ('role-admin',     'ADMIN',          'Quản trị viên',  1),
  ('role-quanly',    'QUAN_LY',        'Quản lý',        1),
  ('role-pheduyet',  'NGUOI_PHE_DUYET','Người phê duyệt',0),
  ('role-thuchien',  'NGUOI_THUC_HIEN','Người thực hiện',0);

-- Quản trị viên: cả 27 quyền.
INSERT INTO role_permissions (role_id, permission)
SELECT 'role-admin', column1 FROM (
  VALUES
    ('process.create'),('process.edit'),('process.review'),('process.approve'),
    ('process.publish'),('process.deprecate'),('process.view'),
    ('execution.create'),('execution.view'),('execution.operate'),('execution.cancel'),('execution.reopen'),
    ('step.execute'),('step.skip'),
    ('exception.raise'),('exception.decide'),('exception.approve'),
    ('evidence.upload'),('evidence.view'),('form.submit'),
    ('report.view'),('report.export'),('audit.view'),
    ('user.manage'),('role.assign'),('scope.manage')
);

-- Quản lý: gói manager cũ (18 quyền), senior=1.
INSERT INTO role_permissions (role_id, permission)
SELECT 'role-quanly', column1 FROM (
  VALUES
    ('process.view'),('process.approve'),
    ('execution.create'),('execution.view'),('execution.operate'),('execution.cancel'),('execution.reopen'),
    ('step.execute'),('step.skip'),
    ('exception.raise'),('exception.decide'),('exception.approve'),
    ('evidence.upload'),('evidence.view'),('form.submit'),
    ('report.view'),('report.export'),('audit.view')
);

-- Người phê duyệt: gói approver cũ (8 quyền), senior=0.
INSERT INTO role_permissions (role_id, permission)
SELECT 'role-pheduyet', column1 FROM (
  VALUES
    ('process.view'),('process.review'),('process.approve'),
    ('execution.view'),('exception.decide'),('exception.approve'),
    ('evidence.view'),('report.view')
);

-- Người thực hiện: gói author+viewer cũ + operate/execute (giả định D-10, xem báo cáo).
INSERT INTO role_permissions (role_id, permission)
SELECT 'role-thuchien', column1 FROM (
  VALUES
    ('process.view'),('process.create'),('process.edit'),
    ('execution.view'),('execution.operate'),
    ('step.execute'),
    ('evidence.view'),('evidence.upload'),('form.submit'),
    ('exception.raise'),('report.view')
);

-- Gán vai trò cho 4 user demo (theo username, D-10).
INSERT INTO user_roles (user_id, role_id)
SELECT id, 'role-admin' FROM users WHERE username = 'admin';
INSERT INTO user_roles (user_id, role_id)
SELECT id, 'role-quanly' FROM users WHERE username = 'quanly';
INSERT INTO user_roles (user_id, role_id)
SELECT id, 'role-pheduyet' FROM users WHERE username = 'pheduyet';
INSERT INTO user_roles (user_id, role_id)
SELECT id, 'role-thuchien' FROM users WHERE username = 'nhanvien';

-- Dọn bảng vai trò cứng cũ.
DROP TABLE user_system_roles;
