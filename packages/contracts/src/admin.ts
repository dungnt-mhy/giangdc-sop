/**
 * Wire contract cho Quản trị hệ thống (T7).
 * Nguồn duy nhất cho DTO dùng chung giữa API và web (AGENTS.md §2, §5).
 * SRS v1.6: ADM-001..006.
 */

/** Trạng thái tài khoản (bảng users.status). */
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED';

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  LOCKED: 'Đã khóa',
  DISABLED: 'Đã vô hiệu',
};

export interface AdminUserDto {
  id: string;
  username: string;
  displayName: string;
  status: UserStatus;
  roleIds: string[];
  roleNames: string[];
  positionIds: string[];
  positionNames: string[];
  scopeIds: string[];
  createdAt: string;
}

export interface AdminUserListResponse {
  items: AdminUserDto[];
  total: number;
}

export interface CreateUserBody {
  username: string;
  displayName: string;
  /** Mật khẩu thô — KHÔNG bao giờ trả về trong response hay ghi vào audit (ADM-003). */
  password: string;
  roleIds?: string[];
  positionIds?: string[];
  scopeIds?: string[];
}

export interface UpdateUserBody {
  displayName?: string;
  /** ACTIVE | LOCKED | DISABLED. Không được tự khóa chính mình. */
  status?: UserStatus;
  /** Đổi mật khẩu — KHÔNG log vào audit (ADM-003). */
  password?: string;
  expectedRevision?: number;
}

export interface AssignRolesBody {
  roleIds: string[];
}

export interface AssignPositionsBody {
  positionIds: string[];
}

export interface RoleWithPermissionsDto {
  id: string;
  code: string;
  name: string;
  seniorApprover: boolean;
  permissions: string[];
}

export interface AdminPositionDto {
  id: string;
  code: string;
  name: string;
  orgUnitId: string | null;
}

export interface AuditEventDto {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  objectType: string | null;
  objectId: string | null;
  reason: string | null;
  flagged: boolean;
  requestId: string | null;
  createdAt: string;
}

export interface AuditListResponse {
  items: AuditEventDto[];
  total: number;
  limit: number;
  offset: number;
}

/** Danh mục lý do (ADM-005). */
export type ReasonCategory = 'cancel' | 'skip' | 'fail' | 'reject';

export const REASON_CATEGORY_LABEL: Record<ReasonCategory, string> = {
  cancel: 'Hủy lượt',
  skip: 'Bỏ qua bước',
  fail: 'Không đạt',
  reject: 'Từ chối',
};

export interface ReasonDto {
  id: string;
  code: string;
  category: ReasonCategory;
  label: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateReasonBody {
  code: string;
  category: ReasonCategory;
  label: string;
}

export interface UpdateReasonBody {
  label?: string;
  category?: ReasonCategory;
  isActive?: boolean;
}

/** Mã lỗi chuẩn cho module admin (SRS §12.2). */
export const ADMIN_ERROR_CODES = [
  'USER_NOT_FOUND',
  'USERNAME_TAKEN',
  'USERNAME_REQUIRED',
  'PASSWORD_REQUIRED',
  'PASSWORD_TOO_SHORT',
  'CANNOT_LOCK_SELF',
  'UNKNOWN_ROLE',
  'UNKNOWN_POSITION',
  'UNKNOWN_SCOPE',
  'INVALID_STATUS',
  'REASON_NOT_FOUND',
  'REASON_CODE_TAKEN',
  'INVALID_CATEGORY',
] as const;
