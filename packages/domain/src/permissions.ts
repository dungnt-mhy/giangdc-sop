import type { SystemRole } from './roles.js';

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

/** Ánh xạ role -> permission mặc định (DEFAULT, chốt ở G2). */
export const ROLE_PERMISSIONS: Record<SystemRole, ReadonlySet<Permission>> = {
  admin: new Set(PERMISSIONS),
  manager: new Set([
    'process.view',
    'process.approve',
    'execution.create',
    'execution.view',
    'execution.operate',
    'execution.cancel',
    'execution.reopen',
    'step.execute',
    'step.skip',
    'exception.raise',
    'exception.decide',
    'exception.approve',
    'evidence.upload',
    'evidence.view',
    'form.submit',
    'report.view',
    'report.export',
    'audit.view',
  ]),
  approver: new Set([
    'process.view',
    'process.review',
    'process.approve',
    'execution.view',
    'exception.decide',
    'exception.approve',
    'evidence.view',
    'report.view',
  ]),
  author: new Set([
    'process.create',
    'process.edit',
    'process.view',
    'execution.view',
    'evidence.view',
    'form.submit',
  ]),
  reviewer: new Set(['process.view', 'process.review', 'execution.view', 'evidence.view']),
  supervisor: new Set([
    'process.view',
    'execution.view',
    'exception.raise',
    'evidence.view',
    'report.view',
    'audit.view',
  ]),
  viewer: new Set(['process.view', 'execution.view', 'evidence.view', 'report.view']),
};

/** Tổng quyền hiệu lực của một người = hợp các permission của mọi role đang giữ. */
export function effectivePermissions(roles: readonly SystemRole[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) {
    for (const p of ROLE_PERMISSIONS[r] ?? []) out.add(p);
  }
  return out;
}

export function hasPermission(roles: readonly SystemRole[], permission: Permission): boolean {
  return effectivePermissions(roles).has(permission);
}
