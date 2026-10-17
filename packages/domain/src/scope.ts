/**
 * Data scope model (OPEN-SCOPE-01, đã chốt 17/10/2026).
 * Cây 2 cấp: 1 org root -> các đơn vị/kho (type OFFICE/WAREHOUSE).
 * Mỗi lượt thực hiện thuộc đúng 1 đơn vị; quyền giới hạn theo đơn vị được gán.
 */
export type OrgUnitType = 'ORG' | 'OFFICE' | 'WAREHOUSE';

export interface OrgUnit {
  id: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
}

/** Đơn vị mà một người được phép xem/thao tác. */
export interface UserScope {
  userId: string;
  orgUnitId: string;
}

/**
 * Người dùng có quyền trên đơn vị mục tiêu không?
 * MVP: khớp chính xác đơn vị được gán. Admin cross-scope do tầng API quyết
 * (mọi truy cập cross-scope đều phải audit).
 */
export function hasScope(userScopes: readonly UserScope[], targetOrgUnitId: string): boolean {
  return userScopes.some((s) => s.orgUnitId === targetOrgUnitId);
}

/** Lọc danh sách id đơn vị mà người dùng được phép thấy. */
export function visibleOrgUnits(userScopes: readonly UserScope[]): string[] {
  return [...new Set(userScopes.map((s) => s.orgUnitId))];
}
