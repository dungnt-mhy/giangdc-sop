/**
 * System roles (vai trò hệ thống) — SRS v1.6 §5.
 * Một người có thể mang nhiều vai trò. Vai trò hệ thống cấp quyền thao tác,
 * tách biệt vai trò nghiệp vụ (BusinessRole) gắn vào từng bước quy trình.
 */
export const SYSTEM_ROLES = [
  'admin', // Quản trị hệ thống
  'manager', // Quản lý đơn vị
  'approver', // Người phê duyệt (role riêng, OPEN-SOD-01)
  'author', // Người soạn quy trình
  'reviewer', // Người thẩm định
  'supervisor', // Giám sát
  'viewer', // Người xem
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Các role được phép phê duyệt (OPEN-SOD-01). */
export const APPROVER_ROLES: ReadonlySet<SystemRole> = new Set([
  'approver',
  'admin',
  'manager',
]);

export function isApproverRole(role: SystemRole): boolean {
  return APPROVER_ROLES.has(role);
}
