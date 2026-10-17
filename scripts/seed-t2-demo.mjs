#!/usr/bin/env node
/**
 * Sinh SQL seed T2 cho D1 demo: quy trình mẫu 11 bước "Xuất hàng đến đại lý"
 * (nội dung từ Shipping.pdf — đã xác minh 11 bước ngày 17/10/2026).
 * Chỉ chạy ở demo/UAT, gắn nhãn SAMPLE (SRS §19.2, AGENTS.md §3).
 * Không chứa secret. SQL ra stdout (/tmp), không commit.
 *
 * Cách dùng:
 *   node scripts/seed-t2-demo.mjs > /tmp/seed-t2.sql
 *   python3 <cf_deploy.py> apps/api d1 execute giangdc-sop-demo --file /tmp/seed-t2.sql --remote
 */
const q = (s) => (s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);

// [code, title, notes/warnings/instructions...]
const steps = [
  ['B01', 'Nhận giấy giới thiệu từ đại lý',
    { notes: 'Thông tin trên giấy giới thiệu khớp với thông tin lái xe và hàng hóa cần lấy.' }],
  ['B02', 'Scan gửi cho KVC staff bởi e-mail', {}],
  ['B03', 'Nhận thông tin hàng xuất từ KVC staff bởi e-mail', {}],
  ['B04', 'Chuẩn bị hồ sơ giấy tờ liên quan',
    { notes: 'In đủ tất cả các loại giấy. Theo từng bộ 1 by 1.' }],
  ['B05', 'Di chuyển hàng chờ xuất đến vị trí quy định',
    { warnings: 'Lưu ý an toàn khi di chuyển, dừng đỗ.' }],
  ['B06', 'Kiểm tra lại 1 lần số khung số máy của máy cần giao',
    { warnings: 'Luôn kiểm tra 2 lần số khung số máy đối với hàng xuất.' }],
  ['B07', 'Kiểm tra cùng lái xe hiện trạng máy',
    { instructions: 'Sử dụng checksheet để kiểm tra đầy đủ các hạng mục.' }],
  ['B08', 'Lái xe ký xác nhận các giấy tờ liên quan',
    { expectedResult: 'Ký và ghi rõ họ tên đầy đủ.' }],
  ['B09', 'Bàn giao máy cho lái xe',
    { notes: 'Di chuyển máy lên xe tải cho lái xe.' }],
  ['B10', 'Bảo vệ ký giấy ra cổng',
    { notes: 'Bảo vệ giữ lại liên màu xanh.' }],
  ['B11', 'Lưu trữ giấy tờ tài liệu',
    { notes: 'Hàng ngày kiểm tra lại lượng giấy tờ đã lưu xem có khớp không. * Kết thúc *' }],
];

let sql = '-- SEED T2 DEMO (SAMPLE) — quy trình mẫu 11 bước từ Shipping.pdf. Chỉ demo/UAT.\n';
sql += `INSERT OR IGNORE INTO processes (id, code, name, purpose, scope, applicable_to, start_condition, end_condition, owner_id, org_unit_id, review_trigger, process_group, created_by) VALUES
  (${q('p-sample-shipping')}, ${q('SAMPLE-SHIPPING')}, ${q('Xuất hàng đến đại lý')},
   ${q('Chuẩn hóa các bước xuất hàng/máy cho đại lý, đảm bảo đủ giấy tờ và kiểm tra kỹ thuật')},
   ${q('Kho Hà Nội')}, ${q('Nhân viên kho, lái xe, bảo vệ')},
   ${q('Nhận giấy giới thiệu từ đại lý')}, ${q('Lưu trữ giấy tờ tài liệu')},
   ${q('u-quanly')}, ${q('kho-hn')}, ${q('Định kỳ hằng năm hoặc khi có sự cố xuất hàng')},
   ${q('Kho vận')}, ${q('u-admin')});\n`;

sql += `INSERT OR IGNORE INTO process_versions (id, process_id, version_no, state, change_summary, change_size, created_by) VALUES
  (${q('pv-sample-v1')}, ${q('p-sample-shipping')}, 1, 'ACTIVE',
   ${q('Bản mẫu demo dựng từ Shipping.pdf (11 bước)')}, 'MINOR', ${q('u-admin')});\n`;

steps.forEach(([code, title, extra], i) => {
  const id = `ps-ship-${String(i + 1).padStart(2, '0')}`;
  sql += `INSERT OR IGNORE INTO process_steps (id, version_id, code, title, instructions, expected_result, notes, warnings, required, sort_order, failure_policy) VALUES
  (${q(id)}, ${q('pv-sample-v1')}, ${q(code)}, ${q(title)},
   ${q(extra.instructions ?? null)}, ${q(extra.expectedResult ?? null)},
   ${q(extra.notes ?? null)}, ${q(extra.warnings ?? null)}, 1, ${i + 1}, 'STOP');\n`;
});

// Hồ sơ phê duyệt mẫu cho version ACTIVE (GOV-004).
sql += `INSERT OR IGNORE INTO approval_records (id, version_id, approver_id, approver_role, decision, reason) VALUES
  (${q('ap-sample-v1')}, ${q('pv-sample-v1')}, ${q('u-pheduyet')}, 'approver', 'APPROVED', ${q('Bản mẫu demo')});\n`;

process.stdout.write(sql);
console.error(`Seeded 1 process + 1 version + ${steps.length} steps (SAMPLE).`);
