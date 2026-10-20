/**
 * DB helpers cho module Quản trị (T7: ADM-001..006).
 * Truy vấn trực tiếp bảng users / roles / positions / audit_events / reason_catalog.
 */
import type {
  AdminOrgUnitDto,
  AdminPositionDto,
  OrgUnitType,
  ReasonCategory,
  RoleWithPermissionsDto,
  UserStatus,
} from '@giangdc-sop/contracts';
import type { DbUser } from './db.js';

export interface AdminUserRow {
  id: string;
  username: string;
  display_name: string;
  status: string;
  email: string | null;
  phone: string | null;
  last_login_at: string | null;
  updated_at: string | null;
  created_at: string;
}

/** Liệt kê user kèm vai trò/chức vụ/phạm vi (ADM-001). */
export async function listAdminUsers(
  db: D1Database,
  opts: { q?: string; status?: UserStatus },
): Promise<AdminUserRow[]> {
  const conds: string[] = [];
  const binds: unknown[] = [];
  if (opts.q) {
    conds.push('(username LIKE ? OR display_name LIKE ?)');
    const like = `%${opts.q}%`;
    binds.push(like, like);
  }
  if (opts.status) {
    conds.push('status = ?');
    binds.push(opts.status);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await db
    .prepare(
      `SELECT id, username, display_name, status, email, phone, last_login_at, updated_at, created_at
       FROM users ${where} ORDER BY created_at DESC`,
    )
    .bind(...binds)
    .all<AdminUserRow>();
  return rows.results ?? [];
}

export interface DbUserWithCreated extends DbUser {
  email: string | null;
  phone: string | null;
  last_login_at: string | null;
  updated_at: string | null;
  created_at: string;
}

export async function findAdminUser(db: D1Database, id: string): Promise<DbUserWithCreated | null> {
  return db
    .prepare(
      'SELECT id, username, display_name, password_hash, status, email, phone, last_login_at, updated_at, created_at FROM users WHERE id = ?1',
    )
    .bind(id)
    .first<DbUserWithCreated>();
}

/** Gán phạm vi kèm tên đơn vị (cho DTO chi tiết user — ADM-001). */
export async function getUserScopeNames(
  db: D1Database,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .prepare(
      `SELECT ou.id, ou.name FROM user_scopes us JOIN org_units ou ON ou.id = us.org_unit_id
       WHERE us.user_id = ?1 ORDER BY ou.name ASC`,
    )
    .bind(userId)
    .all<{ id: string; name: string }>();
  return rows.results ?? [];
}

/** Cập nhật mốc đăng nhập gần nhất (gọi sau login thành công). */
export async function updateLastLogin(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('UPDATE users SET last_login_at = ?1 WHERE id = ?2')
    .bind(new Date().toISOString(), userId)
    .run();
}

export async function usernameTaken(db: D1Database, username: string, excludeId?: string): Promise<boolean> {
  const row = await db
    .prepare(
      excludeId
        ? 'SELECT id FROM users WHERE username = ?1 AND id != ?2'
        : 'SELECT id FROM users WHERE username = ?1',
    )
    .bind(...(excludeId ? [username, excludeId] : [username]))
    .first<{ id: string }>();
  return row !== null;
}

export async function getUserRoleIds(db: D1Database, userId: string): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .prepare(
      `SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?1 ORDER BY r.name ASC`,
    )
    .bind(userId)
    .all<{ id: string; name: string }>();
  return rows.results ?? [];
}

export async function getUserPositionIds(
  db: D1Database,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .prepare(
      `SELECT p.id, p.name FROM user_positions up JOIN positions p ON p.id = up.position_id
       WHERE up.user_id = ?1 ORDER BY p.name ASC`,
    )
    .bind(userId)
    .all<{ id: string; name: string }>();
  return rows.results ?? [];
}

/** Kiểm tra các position id có tồn tại; trả về id KHÔNG tồn tại. */
export async function unknownPositionIds(db: D1Database, ids: string[]): Promise<string[]> {
  const clean = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
  if (clean.length === 0) return [];
  const placeholders = clean.map((_, i) => `?${i + 1}`).join(',');
  const rows = await db
    .prepare(`SELECT id FROM positions WHERE id IN (${placeholders})`)
    .bind(...clean)
    .all<{ id: string }>();
  const found = new Set((rows.results ?? []).map((r) => r.id));
  return clean.filter((id) => !found.has(id));
}

/** Kiểm tra các org_unit id có tồn tại; trả về id KHÔNG tồn tại. */
export async function unknownScopeIds(db: D1Database, ids: string[]): Promise<string[]> {
  const clean = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
  if (clean.length === 0) return [];
  const placeholders = clean.map((_, i) => `?${i + 1}`).join(',');
  const rows = await db
    .prepare(`SELECT id FROM org_units WHERE id IN (${placeholders})`)
    .bind(...clean)
    .all<{ id: string }>();
  const found = new Set((rows.results ?? []).map((r) => r.id));
  return clean.filter((id) => !found.has(id));
}

/** Kiểm tra các role id có tồn tại; trả về id KHÔNG tồn tại. */
export async function unknownRoleIds(db: D1Database, ids: string[]): Promise<string[]> {
  const clean = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
  if (clean.length === 0) return [];
  const placeholders = clean.map((_, i) => `?${i + 1}`).join(',');
  const rows = await db
    .prepare(`SELECT id FROM roles WHERE id IN (${placeholders})`)
    .bind(...clean)
    .all<{ id: string }>();
  const found = new Set((rows.results ?? []).map((r) => r.id));
  return clean.filter((id) => !found.has(id));
}

/** Thay thế toàn bộ vai trò của user (ADM-001). */
export async function setUserRoles(db: D1Database, userId: string, roleIds: string[]): Promise<void> {
  await db.prepare('DELETE FROM user_roles WHERE user_id = ?1').bind(userId).run();
  const clean = [...new Set(roleIds.map((s) => s.trim()).filter(Boolean))];
  for (const roleId of clean) {
    await db
      .prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?1, ?2)')
      .bind(userId, roleId)
      .run();
  }
}

/** Thay thế toàn bộ chức vụ của user (ADM-001). */
export async function setUserPositions(db: D1Database, userId: string, positionIds: string[]): Promise<void> {
  await db.prepare('DELETE FROM user_positions WHERE user_id = ?1').bind(userId).run();
  const clean = [...new Set(positionIds.map((s) => s.trim()).filter(Boolean))];
  for (const positionId of clean) {
    await db
      .prepare('INSERT INTO user_positions (user_id, position_id) VALUES (?1, ?2)')
      .bind(userId, positionId)
      .run();
  }
}

/** Thay thế toàn bộ phạm vi đơn vị của user (ADM-001). */
export async function setUserScopes(db: D1Database, userId: string, scopeIds: string[]): Promise<void> {
  await db.prepare('DELETE FROM user_scopes WHERE user_id = ?1').bind(userId).run();
  const clean = [...new Set(scopeIds.map((s) => s.trim()).filter(Boolean))];
  for (const scopeId of clean) {
    await db
      .prepare('INSERT INTO user_scopes (user_id, org_unit_id) VALUES (?1, ?2)')
      .bind(userId, scopeId)
      .run();
  }
}

/** Vai trò — hàng DB đầy đủ (migration 0017: + description, is_system, updated_at). */
export interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  senior_approver: number;
  is_system: number;
  created_at: string;
  updated_at: string | null;
}

export function toRoleDto(
  r: RoleRow,
  permissions: string[],
  userCount: number,
): RoleWithPermissionsDto {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    seniorApprover: r.senior_approver === 1,
    isSystem: r.is_system === 1,
    userCount,
    permissions,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function findRole(db: D1Database, id: string): Promise<RoleRow | null> {
  return db
    .prepare(
      'SELECT id, code, name, description, senior_approver, is_system, created_at, updated_at FROM roles WHERE id = ?1',
    )
    .bind(id)
    .first<RoleRow>();
}

export async function roleCodeTaken(db: D1Database, code: string, excludeId?: string): Promise<boolean> {
  const row = await db
    .prepare(
      excludeId
        ? 'SELECT id FROM roles WHERE code = ?1 AND id != ?2'
        : 'SELECT id FROM roles WHERE code = ?1',
    )
    .bind(...(excludeId ? [code, excludeId] : [code]))
    .first<{ id: string }>();
  return row !== null;
}

/** Vai trò kèm danh sách quyền + số người dùng (ADM-006). */
export async function listRolesWithPermissions(
  db: D1Database,
): Promise<RoleWithPermissionsDto[]> {
  const roles = await db
    .prepare(
      `SELECT r.id, r.code, r.name, r.description, r.senior_approver, r.is_system,
              r.created_at, r.updated_at,
              (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
       FROM roles r ORDER BY r.name ASC`,
    )
    .all<RoleRow & { user_count: number }>();
  const out: RoleWithPermissionsDto[] = [];
  for (const r of roles.results ?? []) {
    const perms = await db
      .prepare('SELECT permission FROM role_permissions WHERE role_id = ?1 ORDER BY permission ASC')
      .bind(r.id)
      .all<{ permission: string }>();
    out.push(toRoleDto(r, (perms.results ?? []).map((p) => p.permission), r.user_count ?? 0));
  }
  return out;
}

export async function getRolePermissions(db: D1Database, roleId: string): Promise<string[]> {
  const rows = await db
    .prepare('SELECT permission FROM role_permissions WHERE role_id = ?1 ORDER BY permission ASC')
    .bind(roleId)
    .all<{ permission: string }>();
  return (rows.results ?? []).map((r) => r.permission);
}

export async function roleUsage(db: D1Database, roleId: string): Promise<{ userCount: number }> {
  const row = await db
    .prepare('SELECT COUNT(*) AS c FROM user_roles WHERE role_id = ?1')
    .bind(roleId)
    .first<{ c: number }>();
  return { userCount: row?.c ?? 0 };
}

/** Tạo vai trò mới (ADM-006). permissionIds phải đã validate ở tầng endpoint. */
export async function createRole(
  db: D1Database,
  input: { id: string; code: string; name: string; description: string | null; seniorApprover: boolean; permissionIds: string[] },
): Promise<RoleRow | null> {
  await db
    .prepare(
      'INSERT INTO roles (id, code, name, description, senior_approver) VALUES (?1,?2,?3,?4,?5)',
    )
    .bind(input.id, input.code, input.name, input.description, input.seniorApprover ? 1 : 0)
    .run();
  await setRolePermissionsRaw(db, input.id, input.permissionIds);
  return findRole(db, input.id);
}

export async function updateRole(
  db: D1Database,
  id: string,
  input: { name?: string; description?: string | null; seniorApprover?: boolean },
): Promise<RoleRow | null> {
  const updates: string[] = [];
  const binds: unknown[] = [];
  if (input.name !== undefined) {
    updates.push('name = ?');
    binds.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push('description = ?');
    binds.push(input.description);
  }
  if (input.seniorApprover !== undefined) {
    updates.push('senior_approver = ?');
    binds.push(input.seniorApprover ? 1 : 0);
  }
  if (updates.length === 0) return findRole(db, id);
  updates.push('updated_at = ?');
  binds.push(new Date().toISOString());
  binds.push(id);
  await db
    .prepare(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  return findRole(db, id);
}

/** Thay thế toàn bộ quyền của vai trò (không validate — dùng setRolePermissions). */
async function setRolePermissionsRaw(db: D1Database, roleId: string, permissionIds: string[]): Promise<void> {
  await db.prepare('DELETE FROM role_permissions WHERE role_id = ?1').bind(roleId).run();
  const clean = [...new Set(permissionIds.map((s) => s.trim()).filter(Boolean))];
  for (const p of clean) {
    await db
      .prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?1, ?2)')
      .bind(roleId, p)
      .run();
  }
}

/** Gán quyền cho vai trò + cập nhật updated_at. Permission lạ bị lọc ở tầng endpoint. */
export async function setRolePermissions(
  db: D1Database,
  roleId: string,
  permissionIds: string[],
): Promise<RoleRow | null> {
  await setRolePermissionsRaw(db, roleId, permissionIds);
  await db
    .prepare('UPDATE roles SET updated_at = ?1 WHERE id = ?2')
    .bind(new Date().toISOString(), roleId)
    .run();
  return findRole(db, roleId);
}

/** Xóa vai trò + quyền của nó. Guard is_system/in-use ở tầng endpoint. */
export async function deleteRole(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM role_permissions WHERE role_id = ?1').bind(id).run();
  await db.prepare('DELETE FROM roles WHERE id = ?1').bind(id).run();
}

export interface PositionRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  org_unit_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string | null;
}

export function toPositionDto(
  r: PositionRow,
  orgUnitName: string | null,
  userCount: number,
): AdminPositionDto {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    orgUnitId: r.org_unit_id,
    orgUnitName,
    isActive: r.is_active === 1,
    userCount,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Chức vụ kèm tên đơn vị + số người dùng (ADM-001). */
export async function listPositions(
  db: D1Database,
): Promise<(PositionRow & { org_unit_name: string | null; user_count: number })[]> {
  const rows = await db
    .prepare(
      `SELECT p.id, p.code, p.name, p.description, p.org_unit_id, p.is_active,
              p.created_at, p.updated_at, ou.name AS org_unit_name,
              (SELECT COUNT(*) FROM user_positions up WHERE up.position_id = p.id) AS user_count
       FROM positions p LEFT JOIN org_units ou ON ou.id = p.org_unit_id
       ORDER BY p.name ASC`,
    )
    .all<PositionRow & { org_unit_name: string | null; user_count: number }>();
  return rows.results ?? [];
}

export async function findPosition(db: D1Database, id: string): Promise<PositionRow | null> {
  return db
    .prepare(
      'SELECT id, code, name, description, org_unit_id, is_active, created_at, updated_at FROM positions WHERE id = ?1',
    )
    .bind(id)
    .first<PositionRow>();
}

export async function positionCodeTaken(
  db: D1Database,
  code: string,
  excludeId?: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      excludeId
        ? 'SELECT id FROM positions WHERE code = ?1 AND id != ?2'
        : 'SELECT id FROM positions WHERE code = ?1',
    )
    .bind(...(excludeId ? [code, excludeId] : [code]))
    .first<{ id: string }>();
  return row !== null;
}

export async function createPosition(
  db: D1Database,
  input: { id: string; code: string; name: string; description: string | null; orgUnitId: string | null },
): Promise<PositionRow | null> {
  await db
    .prepare(
      'INSERT INTO positions (id, code, name, description, org_unit_id) VALUES (?1,?2,?3,?4,?5)',
    )
    .bind(input.id, input.code, input.name, input.description, input.orgUnitId)
    .run();
  return findPosition(db, input.id);
}

export async function updatePosition(
  db: D1Database,
  id: string,
  input: { name?: string; description?: string | null; orgUnitId?: string | null; isActive?: boolean },
): Promise<PositionRow | null> {
  const updates: string[] = [];
  const binds: unknown[] = [];
  if (input.name !== undefined) {
    updates.push('name = ?');
    binds.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push('description = ?');
    binds.push(input.description);
  }
  if (input.orgUnitId !== undefined) {
    updates.push('org_unit_id = ?');
    binds.push(input.orgUnitId);
  }
  if (input.isActive !== undefined) {
    updates.push('is_active = ?');
    binds.push(input.isActive ? 1 : 0);
  }
  if (updates.length === 0) return findPosition(db, id);
  updates.push('updated_at = ?');
  binds.push(new Date().toISOString());
  binds.push(id);
  await db
    .prepare(`UPDATE positions SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  return findPosition(db, id);
}

/** Mức dùng của chức vụ: số user đang gán + số bước quy trình đang tham chiếu. */
export async function positionUsage(
  db: D1Database,
  positionId: string,
): Promise<{ userCount: number; stepCount: number }> {
  const users = await db
    .prepare('SELECT COUNT(*) AS c FROM user_positions WHERE position_id = ?1')
    .bind(positionId)
    .first<{ c: number }>();
  const needle = `%"${positionId}"%`;
  const steps = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM process_steps
       WHERE performer_position_ids_json LIKE ?1
          OR supervisor_position_ids_json LIKE ?1
          OR skip_json LIKE ?1`,
    )
    .bind(needle)
    .first<{ c: number }>();
  return { userCount: users?.c ?? 0, stepCount: steps?.c ?? 0 };
}

/** Xóa chức vụ. Guard in-use ở tầng endpoint. */
export async function deletePosition(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM positions WHERE id = ?1').bind(id).run();
}

/* ================= Đơn vị (org_units) ================= */

export interface OrgUnitRow {
  id: string;
  code: string | null;
  name: string;
  type: string;
  parent_id: string | null;
  address: string | null;
  phone: string | null;
  manager_user_id: string | null;
  is_active: number;
  created_at: string | null;
  updated_at: string | null;
}

/** DTO thuần — test được, giống toReasonDto. */
export function toOrgUnitDto(
  r: OrgUnitRow,
  opts: { parentName?: string | null; managerUserName?: string | null; childCount?: number; userCount?: number },
): AdminOrgUnitDto {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type as OrgUnitType,
    parentId: r.parent_id,
    parentName: opts.parentName ?? null,
    address: r.address,
    phone: r.phone,
    managerUserId: r.manager_user_id,
    managerUserName: opts.managerUserName ?? null,
    isActive: r.is_active === 1,
    childCount: opts.childCount ?? 0,
    userCount: opts.userCount ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Tất cả đơn vị kèm parentName, childCount, userCount, managerUserName. */
export async function listOrgUnits(db: D1Database): Promise<AdminOrgUnitDto[]> {
  const rows = await db
    .prepare(
      `SELECT ou.id, ou.code, ou.name, ou.type, ou.parent_id, ou.address, ou.phone,
              ou.manager_user_id, ou.is_active, ou.created_at, ou.updated_at,
              par.name AS parent_name, mgr.display_name AS manager_name,
              (SELECT COUNT(*) FROM org_units c WHERE c.parent_id = ou.id) AS child_count,
              (SELECT COUNT(*) FROM user_scopes us WHERE us.org_unit_id = ou.id) AS user_count
       FROM org_units ou
       LEFT JOIN org_units par ON par.id = ou.parent_id
       LEFT JOIN users mgr ON mgr.id = ou.manager_user_id
       ORDER BY ou.name ASC`,
    )
    .all<
      OrgUnitRow & {
        parent_name: string | null;
        manager_name: string | null;
        child_count: number;
        user_count: number;
      }
    >();
  return (rows.results ?? []).map((r) =>
    toOrgUnitDto(r, {
      parentName: r.parent_name,
      managerUserName: r.manager_name,
      childCount: r.child_count ?? 0,
      userCount: r.user_count ?? 0,
    }),
  );
}

export async function findOrgUnit(db: D1Database, id: string): Promise<OrgUnitRow | null> {
  return db
    .prepare(
      'SELECT id, code, name, type, parent_id, address, phone, manager_user_id, is_active, created_at, updated_at FROM org_units WHERE id = ?1',
    )
    .bind(id)
    .first<OrgUnitRow>();
}

export async function orgUnitCodeTaken(
  db: D1Database,
  code: string,
  excludeId?: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      excludeId
        ? 'SELECT id FROM org_units WHERE code = ?1 AND id != ?2'
        : 'SELECT id FROM org_units WHERE code = ?1',
    )
    .bind(...(excludeId ? [code, excludeId] : [code]))
    .first<{ id: string }>();
  return row !== null;
}

export async function createOrgUnit(
  db: D1Database,
  input: {
    id: string;
    code: string | null;
    name: string;
    type: OrgUnitType;
    parentId: string | null;
    address: string | null;
    phone: string | null;
    managerUserId: string | null;
  },
): Promise<OrgUnitRow | null> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO org_units (id, code, name, type, parent_id, address, phone, manager_user_id, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
    )
    .bind(
      input.id, input.code, input.name, input.type, input.parentId,
      input.address, input.phone, input.managerUserId, now,
    )
    .run();
  return findOrgUnit(db, input.id);
}

export async function updateOrgUnit(
  db: D1Database,
  id: string,
  input: {
    code?: string | null;
    name?: string;
    type?: OrgUnitType;
    parentId?: string | null;
    address?: string | null;
    phone?: string | null;
    managerUserId?: string | null;
    isActive?: boolean;
  },
): Promise<OrgUnitRow | null> {
  const updates: string[] = [];
  const binds: unknown[] = [];
  if (input.code !== undefined) {
    updates.push('code = ?');
    binds.push(input.code);
  }
  if (input.name !== undefined) {
    updates.push('name = ?');
    binds.push(input.name);
  }
  if (input.type !== undefined) {
    updates.push('type = ?');
    binds.push(input.type);
  }
  if (input.parentId !== undefined) {
    updates.push('parent_id = ?');
    binds.push(input.parentId);
  }
  if (input.address !== undefined) {
    updates.push('address = ?');
    binds.push(input.address);
  }
  if (input.phone !== undefined) {
    updates.push('phone = ?');
    binds.push(input.phone);
  }
  if (input.managerUserId !== undefined) {
    updates.push('manager_user_id = ?');
    binds.push(input.managerUserId);
  }
  if (input.isActive !== undefined) {
    updates.push('is_active = ?');
    binds.push(input.isActive ? 1 : 0);
  }
  if (updates.length === 0) return findOrgUnit(db, id);
  updates.push('updated_at = ?');
  binds.push(new Date().toISOString());
  binds.push(id);
  await db
    .prepare(`UPDATE org_units SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  return findOrgUnit(db, id);
}

/** Mức dùng của đơn vị: đơn vị con, user scope, quy trình, lượt thực hiện. */
export async function orgUnitUsage(
  db: D1Database,
  orgUnitId: string,
): Promise<{ childCount: number; userCount: number; processCount: number; executionCount: number }> {
  const children = await db
    .prepare('SELECT COUNT(*) AS c FROM org_units WHERE parent_id = ?1')
    .bind(orgUnitId)
    .first<{ c: number }>();
  const users = await db
    .prepare('SELECT COUNT(*) AS c FROM user_scopes WHERE org_unit_id = ?1')
    .bind(orgUnitId)
    .first<{ c: number }>();
  const processes = await db
    .prepare('SELECT COUNT(*) AS c FROM processes WHERE org_unit_id = ?1')
    .bind(orgUnitId)
    .first<{ c: number }>();
  const executions = await db
    .prepare('SELECT COUNT(*) AS c FROM executions WHERE org_unit_id = ?1')
    .bind(orgUnitId)
    .first<{ c: number }>();
  return {
    childCount: children?.c ?? 0,
    userCount: users?.c ?? 0,
    processCount: processes?.c ?? 0,
    executionCount: executions?.c ?? 0,
  };
}

/** Xóa đơn vị. Guard children/in-use ở tầng endpoint. */
export async function deleteOrgUnit(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM org_units WHERE id = ?1').bind(id).run();
}

/**
 * Dựng cây phân cấp từ danh sách phẳng (thuần — test được).
 * Đơn vị mồ côi (parentId trỏ tới id không tồn tại) được đưa lên gốc.
 */
export function buildOrgUnitTree(items: AdminOrgUnitDto[]): AdminOrgUnitDto[] {
  const byId = new Map<string, AdminOrgUnitDto>();
  for (const it of items) byId.set(it.id, { ...it, children: [] });
  const roots: AdminOrgUnitDto[] = [];
  for (const it of byId.values()) {
    if (it.parentId && byId.has(it.parentId)) {
      byId.get(it.parentId)!.children!.push(it);
    } else {
      roots.push(it);
    }
  }
  return roots;
}

/* ================= Audit log (ADM-002/004) ================= */

export interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  object_type: string | null;
  object_id: string | null;
  reason: string | null;
  flagged: number;
  request_id: string | null;
  created_at: string;
}

export interface AuditFilter {
  from?: string;
  to?: string;
  actorId?: string;
  action?: string;
  objectType?: string;
  q?: string;
  limit: number;
  offset: number;
}

export async function listAudit(
  db: D1Database,
  f: AuditFilter,
): Promise<{ items: AuditRow[]; total: number }> {
  const conds: string[] = [];
  const binds: unknown[] = [];
  if (f.from) {
    conds.push('a.created_at >= ?');
    binds.push(f.from);
  }
  if (f.to) {
    conds.push('a.created_at <= ?');
    binds.push(f.to);
  }
  if (f.actorId) {
    conds.push('a.actor_id = ?');
    binds.push(f.actorId);
  }
  if (f.action) {
    conds.push('a.action = ?');
    binds.push(f.action);
  }
  if (f.objectType) {
    conds.push('a.object_type = ?');
    binds.push(f.objectType);
  }
  if (f.q) {
    conds.push('(a.action LIKE ? OR a.object_id LIKE ? OR a.reason LIKE ?)');
    const like = `%${f.q}%`;
    binds.push(like, like, like);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS c FROM audit_events a ${where}`)
    .bind(...binds)
    .first<{ c: number }>();
  const rows = await db
    .prepare(
      `SELECT a.id, a.actor_id, u.display_name AS actor_name, a.action, a.object_type,
              a.object_id, a.reason, a.flagged, a.request_id, a.created_at
       FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
       ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, f.limit, f.offset)
    .all<AuditRow>();
  return { items: rows.results ?? [], total: totalRow?.c ?? 0 };
}

/* ================= Danh mục lý do (ADM-005) ================= */

export interface ReasonRow {
  id: string;
  code: string;
  category: string;
  label: string;
  is_active: number;
  created_at: string;
}

export async function listReasons(db: D1Database, includeInactive = true): Promise<ReasonRow[]> {
  const rows = await db
    .prepare(
      `SELECT id, code, category, label, is_active, created_at FROM reason_catalog
       ${includeInactive ? '' : 'WHERE is_active = 1 '}ORDER BY category ASC, label ASC`,
    )
    .all<ReasonRow>();
  return rows.results ?? [];
}

export async function findReason(db: D1Database, id: string): Promise<ReasonRow | null> {
  return db
    .prepare('SELECT id, code, category, label, is_active, created_at FROM reason_catalog WHERE id = ?1')
    .bind(id)
    .first<ReasonRow>();
}

export async function reasonCodeTaken(db: D1Database, code: string, excludeId?: string): Promise<boolean> {
  const row = await db
    .prepare(
      excludeId
        ? 'SELECT id FROM reason_catalog WHERE code = ?1 AND id != ?2'
        : 'SELECT id FROM reason_catalog WHERE code = ?1',
    )
    .bind(...(excludeId ? [code, excludeId] : [code]))
    .first<{ id: string }>();
  return row !== null;
}

export function toReasonDto(r: ReasonRow) {
  return {
    id: r.id,
    code: r.code,
    category: r.category as ReasonCategory,
    label: r.label,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
  };
}
