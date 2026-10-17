/**
 * Permission catalog — tập permission code ổn định theo capability (SRS v1.6 §5).
 * Mọi capability thực thi phải map tới permission đã công bố; agent không tự tạo
 * permission để mở quyền. Khóa trước G2.
 */
export const PERMISSIONS = [
  // Quản trị quy trình
  'process.create',
  'process.edit',
  'process.review',
  'process.approve',
  'process.publish',
  'process.deprecate',
  'process.view',
  // Thực hiện
  'execution.create',
  'execution.view',
  'execution.operate',
  'execution.cancel',
  'execution.reopen',
  // Bước
  'step.execute',
  'step.skip',
  // Ngoại lệ
  'exception.raise',
  'exception.decide',
  'exception.approve',
  // Bằng chứng / biểu mẫu
  'evidence.upload',
  'evidence.view',
  'form.submit',
  // Báo cáo / kiểm toán
  'report.view',
  'report.export',
  'audit.view',
  // Quản trị hệ thống
  'user.manage',
  'role.assign',
  'scope.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Tổng quyền hiệu lực của một người = hợp các permission của mọi vai trò đang giữ.
 * D-10: tập quyền nạp từ bảng `role_permissions` (DB), không còn map cứng 7 role.
 */
export function effectivePermissions(
  rolePermissions: ReadonlyArray<Iterable<Permission>>,
): Set<Permission> {
  const out = new Set<Permission>();
  for (const rp of rolePermissions) {
    for (const p of rp) out.add(p);
  }
  return out;
}

export function hasPermission(
  permissions: ReadonlySet<Permission>,
  permission: Permission,
): boolean {
  return permissions.has(permission);
}
