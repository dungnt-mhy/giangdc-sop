#!/usr/bin/env node
/**
 * Sinh SQL seed demo cho D1 (chỉ chạy ở demo/UAT, gắn nhãn SAMPLE — SRS §19.2).
 * Mật khẩu lấy từ biến môi trường DEMO_PASSWORDS (JSON) hoặc dùng giá trị
 * demo mặc định. KHÔNG commit file SQL chứa hash vào repo.
 *
 * Cách dùng:
 *   node scripts/seed-demo.mjs > /tmp/seed-demo.sql
 *   python3 <cf_deploy.py> apps/api d1 execute giangdc-sop-demo --file /tmp/seed-demo.sql --remote
 */
const ITERATIONS = 100_000;

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

const passwords = process.env.DEMO_PASSWORDS
  ? JSON.parse(process.env.DEMO_PASSWORDS)
  : { admin: 'Admin@123', quanly: 'Manager@123', pheduyet: 'Approve@123', nhanvien: 'Staff@123' };

// OPEN-SCOPE-01: 1 org root + 2 đơn vị mẫu (văn phòng + kho).
const units = [
  ['org-root', 'Công ty Demo', 'ORG', null],
  ['vp-hn', 'Văn phòng Hà Nội', 'OFFICE', 'org-root'],
  ['kho-hn', 'Kho Hà Nội', 'WAREHOUSE', 'org-root'],
];

const users = [
  // [id, username, display_name, roles[], scopes[]]
  ['u-admin', 'admin', 'Admin Hệ thống', ['admin'], ['org-root', 'vp-hn', 'kho-hn']],
  ['u-quanly', 'quanly', 'Quản lý Kho', ['manager'], ['kho-hn']],
  ['u-pheduyet', 'pheduyet', 'Người Phê duyệt', ['approver'], ['vp-hn', 'kho-hn']],
  ['u-nhanvien', 'nhanvien', 'Nhân viên', ['author', 'viewer'], ['kho-hn']],
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
let sql = '-- SEED DEMO (SAMPLE) — chỉ dùng ở demo/UAT, không chạy ở production.\n';
for (const [id, name, type, parent] of units) {
  sql += `INSERT OR IGNORE INTO org_units (id, name, type, parent_id) VALUES (${q(id)}, ${q(name)}, ${q(type)}, ${parent ? q(parent) : 'NULL'});\n`;
}
for (const [id, username, displayName, roles, scopes] of users) {
  const hash = await hashPassword(passwords[username]);
  sql += `INSERT OR IGNORE INTO users (id, username, display_name, password_hash) VALUES (${q(id)}, ${q(username)}, ${q(displayName)}, ${q(hash)});\n`;
  for (const r of roles) {
    sql += `INSERT OR IGNORE INTO user_system_roles (user_id, role) VALUES (${q(id)}, ${q(r)});\n`;
  }
  for (const s of scopes) {
    sql += `INSERT OR IGNORE INTO user_scopes (user_id, org_unit_id) VALUES (${q(id)}, ${q(s)});\n`;
  }
}
process.stdout.write(sql);
console.error(`Seeded ${users.length} users, ${units.length} org units.`);
