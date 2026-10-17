import type { Permission } from './permissions.js';

/**
 * Vai trò ứng dụng (D-10): chức năng trong app (Quản trị viên, Quản lý,
 * Người phê duyệt, Người thực hiện...). Lưu trong bảng `roles`, thêm tùy ý —
 * KHÔNG còn 7 vai trò cứng. Tên vai trò không gắn kho/đơn vị (phạm vi do scope).
 */
export interface RoleRecord {
  id: string;
  code: string;
  name: string;
  /** Vai trò senior mới được duyệt mức HIGH/BLOCKING (D-10, thay manager/admin cũ). */
  seniorApprover: boolean;
}

/** Vai trò kèm tập quyền nạp từ bảng `role_permissions`. */
export interface RoleWithPermissions extends RoleRecord {
  permissions: Permission[];
}
