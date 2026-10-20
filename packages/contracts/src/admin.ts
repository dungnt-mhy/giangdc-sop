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
  email: string | null;
  phone: string | null;
  lastLoginAt: string | null;
  roleIds: string[];
  roleNames: string[];
  positionIds: string[];
  positionNames: string[];
  scopeIds: string[];
  scopeNames: string[];
  createdAt: string;
  updatedAt: string | null;
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
  email?: string;
  phone?: string;
  roleIds?: string[];
  positionIds?: string[];
  scopeIds?: string[];
}

export interface UpdateUserBody {
  displayName?: string;
  email?: string | null;
  phone?: string | null;
  /** ACTIVE | LOCKED | DISABLED. Không được tự khóa chính mình. */
  status?: UserStatus;
  /** Đổi mật khẩu — KHÔNG log vào audit (ADM-003). */
  password?: string;
  expectedRevision?: number;
}

export interface AssignScopesBody {
  scopeIds: string[];
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
  description: string | null;
  seniorApprover: boolean;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateRoleBody {
  code: string;
  name: string;
  description?: string;
  seniorApprover?: boolean;
  permissionIds?: string[];
}

export interface UpdateRoleBody {
  name?: string;
  description?: string | null;
  seniorApprover?: boolean;
}

export interface AssignPermissionsBody {
  permissionIds: string[];
}

export interface AdminPositionDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  orgUnitId: string | null;
  orgUnitName: string | null;
  isActive: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreatePositionBody {
  code: string;
  name: string;
  description?: string;
  orgUnitId?: string | null;
}

export interface UpdatePositionBody {
  name?: string;
  description?: string | null;
  orgUnitId?: string | null;
  isActive?: boolean;
}

/** Loại đơn vị (khớp CHECK constraint bảng org_units). */
export type OrgUnitType = 'ORG' | 'OFFICE' | 'WAREHOUSE';

export const ORG_UNIT_TYPE_LABEL: Record<OrgUnitType, string> = {
  ORG: 'Tổng công ty',
  OFFICE: 'Văn phòng / Chi nhánh',
  WAREHOUSE: 'Kho',
};

export interface AdminOrgUnitDto {
  id: string;
  code: string | null;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
  parentName: string | null;
  address: string | null;
  phone: string | null;
  managerUserId: string | null;
  managerUserName: string | null;
  isActive: boolean;
  /** Số đơn vị con trực tiếp. */
  childCount: number;
  /** Số người dùng thuộc phạm vi đơn vị. */
  userCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  /** Cây con — chỉ có khi lấy dạng cây. */
  children?: AdminOrgUnitDto[];
}

export interface CreateOrgUnitBody {
  code?: string;
  name: string;
  type: OrgUnitType;
  parentId?: string | null;
  address?: string;
  phone?: string;
  managerUserId?: string | null;
}

export interface UpdateOrgUnitBody {
  code?: string | null;
  name?: string;
  type?: OrgUnitType;
  parentId?: string | null;
  address?: string | null;
  phone?: string | null;
  managerUserId?: string | null;
  isActive?: boolean;
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
  'ROLE_NOT_FOUND',
  'ROLE_CODE_TAKEN',
  'ROLE_IS_SYSTEM',
  'ROLE_IN_USE',
  'UNKNOWN_PERMISSION',
  'POSITION_NOT_FOUND',
  'POSITION_CODE_TAKEN',
  'POSITION_IN_USE',
  'ORG_UNIT_NOT_FOUND',
  'ORG_UNIT_CODE_TAKEN',
  'ORG_UNIT_HAS_CHILDREN',
  'ORG_UNIT_IN_USE',
  'ORG_UNIT_PARENT_INVALID',
  'INVALID_TYPE',
] as const;
