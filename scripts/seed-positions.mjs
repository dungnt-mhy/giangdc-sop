#!/usr/bin/env node
/**
 * Sinh SQL seed chức vụ (D-09) cho D1 demo: 5 chức vụ mẫu + gán cho user demo.
 * Chỉ chạy ở demo/UAT, gắn nhãn SAMPLE (SRS §19.2, AGENTS.md §3).
 * Không chứa secret. SQL ra stdout (/tmp), không commit.
 *
 * Cách dùng:
 *   node scripts/seed-positions.mjs > /tmp/seed-positions.sql
 *   python3 ~/workspace/custom-connectors/custom.cloudflare/bin/cf_deploy.py apps/api d1 execute giangdc-sop-demo --file /tmp/seed-positions.sql --remote
 */
const q = (s) => (s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);

// [id, code, name] — 5 chức vụ mẫu theo yêu cầu D-09 (17/10/2026)
const positions = [
  ['pos-thu-kho', 'THU_KHO', 'Thủ kho'],
  ['pos-thu-quy', 'THU_QUY', 'Thủ quỹ'],
  ['pos-ql-kho', 'QL_KHO', 'Quản lý kho'],
  ['pos-le-tan', 'LE_TAN', 'Lễ tân'],
  ['pos-giam-sat', 'GIAM_SAT', 'Giám sát'],
];

// [user_id, position_id] — gán chức vụ cho user demo
const assignments = [
  ['u-nhanvien', 'pos-thu-kho'],
  ['u-quanly', 'pos-ql-kho'],
  ['u-pheduyet', 'pos-giam-sat'],
];

let sql = '-- SEED POSITIONS DEMO (SAMPLE, D-09) — 5 chức vụ + gán user demo. Chỉ demo/UAT.\n';
for (const [id, code, name] of positions) {
  sql += `INSERT OR IGNORE INTO positions (id, code, name) VALUES (${q(id)}, ${q(code)}, ${q(name)});\n`;
}
for (const [uid, pid] of assignments) {
  sql += `INSERT OR IGNORE INTO user_positions (user_id, position_id) VALUES (${q(uid)}, ${q(pid)});\n`;
}
process.stdout.write(sql);
