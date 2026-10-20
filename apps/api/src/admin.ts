/**
 * Module Quản trị (T7): tài khoản, vai trò, danh mục lý do, audit log.
 * SRS v1.6: ADM-001..006. Tất cả endpoint yêu cầu quyền `user.manage`.
 *
 * ADM-003: KHÔNG BAO GIỜ ghi password/token vào audit — các audit dưới đây
 * chỉ ghi action + object, không kèm body chứa password.
 */
import { Hono } from 'hono';
import { PERMISSIONS, hashPassword } from '@giangdc-sop/domain';
import type {
  AdminOrgUnitDto,
  AdminUserDto,
  AssignPermissionsBody,
  AssignPositionsBody,
  AssignRolesBody,
  AssignScopesBody,
  CreateOrgUnitBody,
  CreatePositionBody,
  CreateReasonBody,
  CreateRoleBody,
  CreateUserBody,
  OrgUnitType,
  ReasonCategory,
  UpdateOrgUnitBody,
  UpdatePositionBody,
  UpdateReasonBody,
  UpdateRoleBody,
  UpdateUserBody,
  UserStatus,
} from '@giangdc-sop/contracts';
import {
  buildOrgUnitTree,
  createOrgUnit,
  createPosition,
  createRole,
  deleteOrgUnit,
  deletePosition,
  deleteRole,
  findAdminUser,
  findOrgUnit,
  findPosition,
  findReason,
  findRole,
  getRolePermissions,
  getUserPositionIds,
  getUserRoleIds,
  getUserScopeNames,
  listAdminUsers,
  listAudit,
  listOrgUnits,
  listPositions,
  listReasons,
  listRolesWithPermissions,
  orgUnitCodeTaken,
  orgUnitUsage,
  positionCodeTaken,
  positionUsage,
  reasonCodeTaken,
  roleCodeTaken,
  roleUsage,
  setRolePermissions,
  setUserPositions,
  setUserRoles,
  setUserScopes,
  toOrgUnitDto,
  toPositionDto,
  toReasonDto,
  toRoleDto,
  unknownPositionIds,
  unknownRoleIds,
  unknownScopeIds,
  updateOrgUnit,
  updatePosition,
  updateRole,
  usernameTaken,
  type OrgUnitRow,
} from './adminDb.js';
import { writeAudit } from './db.js';
import { errorBody, requireAuth, requirePermission } from './middleware.js';
import { withIdempotency } from './processes.js';
import type { AppEnv, AuthSession } from './env.js';

export const adminApp = new Hono<AppEnv>();

adminApp.use('*', requireAuth, requirePermission('user.manage'));

const VALID_STATUSES: UserStatus[] = ['ACTIVE', 'LOCKED', 'DISABLED'];
const VALID_CATEGORIES: ReasonCategory[] = ['cancel', 'skip', 'fail', 'reject'];
const MIN_PASSWORD_LEN = 8;

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Validate thuần cho tài khoản (test được, ADM-001/003).
 * Trả về mã lỗi hoặc null nếu hợp lệ.
 */
export function validateNewUsername(username: string): 'USERNAME_REQUIRED' | null {
  return username.trim() ? null : 'USERNAME_REQUIRED';
}

export function validatePassword(password: string): 'PASSWORD_REQUIRED' | 'PASSWORD_TOO_SHORT' | null {
  if (!password) return 'PASSWORD_REQUIRED';
  if (password.length < MIN_PASSWORD_LEN) return 'PASSWORD_TOO_SHORT';
  return null;
}

/** ADM-001: không cho tự khóa/vô hiệu chính mình. */
export function validateSelfLock(
  actorId: string,
  targetId: string,
  status?: UserStatus,
): 'CANNOT_LOCK_SELF' | null {
  if (actorId === targetId && status !== undefined && status !== 'ACTIVE') return 'CANNOT_LOCK_SELF';
  return null;
}

export function isValidStatus(s: unknown): s is UserStatus {
  return typeof s === 'string' && (VALID_STATUSES as string[]).includes(s);
}

export function isValidCategory(s: unknown): s is ReasonCategory {
  return typeof s === 'string' && (VALID_CATEGORIES as string[]).includes(s);
}

const VALID_ORG_UNIT_TYPES: OrgUnitType[] = ['ORG', 'OFFICE', 'WAREHOUSE'];

export function isValidOrgUnitType(s: unknown): s is OrgUnitType {
  return typeof s === 'string' && (VALID_ORG_UNIT_TYPES as string[]).includes(s);
}

/** Permission không thuộc catalog PERMISSIONS (domain) — ADM-006. */
export function unknownPermissions(ids: string[]): string[] {
  const valid = new Set<string>(PERMISSIONS as readonly string[]);
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))].filter((id) => !valid.has(id));
}

/** Guard xóa vai trò: vai trò hệ thống không xóa được; đang có user gán cũng không. */
export function validateRoleDelete(role: {
  isSystem: boolean;
  userCount: number;
}): 'ROLE_IS_SYSTEM' | 'ROLE_IN_USE' | null {
  if (role.isSystem) return 'ROLE_IS_SYSTEM';
  if (role.userCount > 0) return 'ROLE_IN_USE';
  return null;
}

/** Guard xóa chức vụ: đang gán cho user hoặc đang dùng ở bước quy trình thì không xóa. */
export function validatePositionDelete(usage: {
  userCount: number;
  stepCount: number;
}): 'POSITION_IN_USE' | null {
  if (usage.userCount > 0 || usage.stepCount > 0) return 'POSITION_IN_USE';
  return null;
}

/** Guard xóa đơn vị: còn đơn vị con → ORG_UNIT_HAS_CHILDREN; còn user/quy trình/lượt → ORG_UNIT_IN_USE. */
export function validateOrgUnitDelete(usage: {
  childCount: number;
  userCount: number;
  processCount: number;
  executionCount: number;
}): 'ORG_UNIT_HAS_CHILDREN' | 'ORG_UNIT_IN_USE' | null {
  if (usage.childCount > 0) return 'ORG_UNIT_HAS_CHILDREN';
  if (usage.userCount > 0 || usage.processCount > 0 || usage.executionCount > 0) return 'ORG_UNIT_IN_USE';
  return null;
}

/**
 * Chặn vòng lặp cây đơn vị: parentId không được là chính đơn vị đó hoặc hậu duệ của nó.
 * `all` = danh sách {id, parentId} hiện tại.
 */
export function isOrgUnitParentCycle(
  all: { id: string; parentId: string | null }[],
  selfId: string,
  parentId: string | null,
): boolean {
  if (!parentId) return false;
  if (parentId === selfId) return true;
  const parentOf = new Map(all.map((u) => [u.id, u.parentId]));
  let cur: string | null = parentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === selfId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

/**
 * Nội dung audit cho reset password (ADM-003): cố định, KHÔNG chứa mật khẩu.
 * Test đảm bảo chuỗi này không rò rỉ password ở bất kỳ dạng nào.
 */
export function resetPasswordAuditReason(username: string): string {
  return `Đặt lại mật khẩu cho tài khoản ${username}`;
}

async function parseJson<T>(c: { req: { json(): Promise<T> } }): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

/** Dựng DTO đầy đủ cho 1 user (vai trò/chức vụ/phạm vi). */
async function toAdminUserDto(db: D1Database, userId: string): Promise<AdminUserDto | null> {
  const u = await findAdminUser(db, userId);
  if (!u) return null;
  const [roles, positions, scopes] = await Promise.all([
    getUserRoleIds(db, userId),
    getUserPositionIds(db, userId),
    getUserScopeNames(db, userId),
  ]);
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    status: u.status as UserStatus,
    email: u.email,
    phone: u.phone,
    lastLoginAt: u.last_login_at,
    roleIds: roles.map((r) => r.id),
    roleNames: roles.map((r) => r.name),
    positionIds: positions.map((p) => p.id),
    positionNames: positions.map((p) => p.name),
    scopeIds: scopes.map((s) => s.id),
    scopeNames: scopes.map((s) => s.name),
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

/* ================= Tài khoản (ADM-001) ================= */

/** GET /admin/users — liệt kê tài khoản (lọc q, status). */
adminApp.get('/users', async (c) => {
  const requestId = c.get('requestId') as string;
  const q = c.req.query('q')?.trim() || undefined;
  const status = c.req.query('status');
  if (status && !isValidStatus(status)) {
    return c.json(errorBody('INVALID_STATUS', 'Trạng thái không hợp lệ.', requestId), 400);
  }
  const rows = await listAdminUsers(c.env.DB, { q, status: status as UserStatus | undefined });
  const items: AdminUserDto[] = [];
  for (const r of rows) {
    const dto = await toAdminUserDto(c.env.DB, r.id);
    if (dto) items.push(dto);
  }
  return c.json({ items, total: items.length });
});

/** POST /admin/users — tạo tài khoản. Idempotent. */
adminApp.post('/users', async (c) => {
  const body = await parseJson<CreateUserBody>(c);
  return withIdempotency(c, 'admin.user.create', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const username = (body?.username ?? '').trim();
    const displayName = (body?.displayName ?? '').trim();
    const password = body?.password ?? '';
    const usernameErr = validateNewUsername(body?.username ?? '');
    if (usernameErr) {
      return { status: 400, body: errorBody(usernameErr, 'Thiếu tên đăng nhập.', requestId) };
    }
    if (!displayName) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu tên hiển thị.', requestId) };
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      return {
        status: 400,
        body: errorBody(
          pwErr,
          pwErr === 'PASSWORD_REQUIRED' ? 'Thiếu mật khẩu.' : `Mật khẩu phải từ ${MIN_PASSWORD_LEN} ký tự.`,
          requestId,
        ),
      };
    }
    if (await usernameTaken(c.env.DB, username)) {
      return { status: 409, body: errorBody('USERNAME_TAKEN', 'Tên đăng nhập đã tồn tại.', requestId) };
    }
    const roleIds = body?.roleIds ?? [];
    const positionIds = body?.positionIds ?? [];
    const scopeIds = body?.scopeIds ?? [];
    const badRoles = await unknownRoleIds(c.env.DB, roleIds);
    if (badRoles.length > 0) {
      return { status: 400, body: errorBody('UNKNOWN_ROLE', `Vai trò không tồn tại: ${badRoles.join(', ')}.`, requestId) };
    }
    const badPositions = await unknownPositionIds(c.env.DB, positionIds);
    if (badPositions.length > 0) {
      return { status: 400, body: errorBody('UNKNOWN_POSITION', `Chức vụ không tồn tại: ${badPositions.join(', ')}.`, requestId) };
    }
    const badScopes = await unknownScopeIds(c.env.DB, scopeIds);
    if (badScopes.length > 0) {
      return { status: 400, body: errorBody('UNKNOWN_SCOPE', `Đơn vị không tồn tại: ${badScopes.join(', ')}.`, requestId) };
    }
    const id = newId();
    await c.env.DB
      .prepare('INSERT INTO users (id, username, display_name, password_hash, status, email, phone) VALUES (?1,?2,?3,?4,\'ACTIVE\',?5,?6)')
      .bind(id, username, displayName, await hashPassword(password), body?.email?.trim() || null, body?.phone?.trim() || null)
      .run();
    await setUserRoles(c.env.DB, id, roleIds);
    await setUserPositions(c.env.DB, id, positionIds);
    await setUserScopes(c.env.DB, id, scopeIds);
    // ADM-002/003: audit chỉ ghi action + object, KHÔNG kèm password.
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'user.create',
      objectType: 'user',
      objectId: id,
      reason: `Tạo tài khoản ${username}`,
      requestId,
    });
    const dto = await toAdminUserDto(c.env.DB, id);
    return { status: 201, body: { user: dto } };
  });
});

/** PATCH /admin/users/:id — sửa tên hiển thị, khóa/mở, đổi mật khẩu. */
adminApp.patch('/users/:id', async (c) => {
  const body = await parseJson<UpdateUserBody>(c);
  return withIdempotency(c, 'admin.user.update', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const user = await findAdminUser(c.env.DB, id);
    if (!user) {
      return { status: 404, body: errorBody('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', requestId) };
    }
    if (!body) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Yêu cầu không hợp lệ.', requestId) };
    }
    const updates: string[] = [];
    const binds: unknown[] = [];
    const auditNotes: string[] = [];
    if (body.displayName !== undefined) {
      const name = body.displayName.trim();
      if (!name) {
        return { status: 400, body: errorBody('INVALID_REQUEST', 'Tên hiển thị không được rỗng.', requestId) };
      }
      updates.push('display_name = ?');
      binds.push(name);
      auditNotes.push('đổi tên hiển thị');
    }
    if (body.email !== undefined) {
      updates.push('email = ?');
      binds.push(body.email ? body.email.trim() : null);
      auditNotes.push('đổi email');
    }
    if (body.phone !== undefined) {
      updates.push('phone = ?');
      binds.push(body.phone ? body.phone.trim() : null);
      auditNotes.push('đổi số điện thoại');
    }
    if (body.status !== undefined) {
      if (!isValidStatus(body.status)) {
        return { status: 400, body: errorBody('INVALID_STATUS', 'Trạng thái không hợp lệ.', requestId) };
      }
      if (validateSelfLock(session.user_id, id, body.status)) {
        return { status: 409, body: errorBody('CANNOT_LOCK_SELF', 'Không được tự khóa/vô hiệu chính mình.', requestId) };
      }
      updates.push('status = ?');
      binds.push(body.status);
      auditNotes.push(`chuyển trạng thái → ${body.status}`);
    }
    let passwordChanged = false;
    if (body.password !== undefined) {
      const pwErr = validatePassword(body.password);
      if (pwErr) {
        return {
          status: 400,
          body: errorBody('PASSWORD_TOO_SHORT', `Mật khẩu phải từ ${MIN_PASSWORD_LEN} ký tự.`, requestId),
        };
      }
      updates.push('password_hash = ?');
      binds.push(await hashPassword(body.password));
      passwordChanged = true;
      auditNotes.push('đổi mật khẩu');
    }
    if (updates.length === 0) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Không có gì để cập nhật.', requestId) };
    }
    updates.push('updated_at = ?');
    binds.push(new Date().toISOString());
    binds.push(id);
    await c.env.DB
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...binds)
      .run();
    // ADM-003: audit không ghi password, chỉ ghi đã đổi.
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: passwordChanged && auditNotes.length === 1 ? 'user.password_change' : 'user.update',
      objectType: 'user',
      objectId: id,
      reason: `Cập nhật tài khoản ${user.username}: ${auditNotes.join(', ')}`,
      requestId,
    });
    const dto = await toAdminUserDto(c.env.DB, id);
    return { status: 200, body: { user: dto } };
  });
});

/** POST /admin/users/:id/roles — gán lại toàn bộ vai trò. */
adminApp.post('/users/:id/roles', async (c) => {
  const body = await parseJson<AssignRolesBody>(c);
  return withIdempotency(c, 'admin.user.roles', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const user = await findAdminUser(c.env.DB, id);
    if (!user) {
      return { status: 404, body: errorBody('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', requestId) };
    }
    const roleIds = body?.roleIds ?? [];
    const bad = await unknownRoleIds(c.env.DB, roleIds);
    if (bad.length > 0) {
      return { status: 400, body: errorBody('UNKNOWN_ROLE', `Vai trò không tồn tại: ${bad.join(', ')}.`, requestId) };
    }
    await setUserRoles(c.env.DB, id, roleIds);
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'user.roles_assign',
      objectType: 'user',
      objectId: id,
      reason: `Gán vai trò cho ${user.username}`,
      requestId,
    });
    const dto = await toAdminUserDto(c.env.DB, id);
    return { status: 200, body: { user: dto } };
  });
});

/** POST /admin/users/:id/positions — gán lại toàn bộ chức vụ. */
adminApp.post('/users/:id/positions', async (c) => {
  const body = await parseJson<AssignPositionsBody>(c);
  return withIdempotency(c, 'admin.user.positions', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const user = await findAdminUser(c.env.DB, id);
    if (!user) {
      return { status: 404, body: errorBody('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', requestId) };
    }
    const positionIds = body?.positionIds ?? [];
    const bad = await unknownPositionIds(c.env.DB, positionIds);
    if (bad.length > 0) {
      return { status: 400, body: errorBody('UNKNOWN_POSITION', `Chức vụ không tồn tại: ${bad.join(', ')}.`, requestId) };
    }
    await setUserPositions(c.env.DB, id, positionIds);
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'user.positions_assign',
      objectType: 'user',
      objectId: id,
      reason: `Gán chức vụ cho ${user.username}`,
      requestId,
    });
    const dto = await toAdminUserDto(c.env.DB, id);
    return { status: 200, body: { user: dto } };
  });
});

/** GET /admin/users/:id — chi tiết 1 tài khoản (ADM-001). */
adminApp.get('/users/:id', async (c) => {
  const requestId = c.get('requestId') as string;
  const id = c.req.param('id');
  const dto = await toAdminUserDto(c.env.DB, id);
  if (!dto) {
    return c.json(errorBody('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', requestId), 404);
  }
  return c.json({ user: dto });
});

/** POST /admin/users/:id/scopes — gán lại toàn bộ phạm vi đơn vị. */
adminApp.post('/users/:id/scopes', async (c) => {
  const body = await parseJson<AssignScopesBody>(c);
  return withIdempotency(c, 'admin.user.scopes', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const user = await findAdminUser(c.env.DB, id);
    if (!user) {
      return { status: 404, body: errorBody('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', requestId) };
    }
    const scopeIds = body?.scopeIds ?? [];
    const bad = await unknownScopeIds(c.env.DB, scopeIds);
    if (bad.length > 0) {
      return { status: 400, body: errorBody('UNKNOWN_SCOPE', `Đơn vị không tồn tại: ${bad.join(', ')}.`, requestId) };
    }
    await setUserScopes(c.env.DB, id, scopeIds);
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'user.assign_scopes',
      objectType: 'user',
      objectId: id,
      reason: `Gán phạm vi đơn vị cho ${user.username}`,
      requestId,
    });
    const dto = await toAdminUserDto(c.env.DB, id);
    return { status: 200, body: { user: dto } };
  });
});

/** POST /admin/users/:id/reset-password — đặt lại mật khẩu (ADM-003: không log password). */
adminApp.post('/users/:id/reset-password', async (c) => {
  const body = await parseJson<{ password?: string }>(c);
  return withIdempotency(c, 'admin.user.reset_password', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const user = await findAdminUser(c.env.DB, id);
    if (!user) {
      return { status: 404, body: errorBody('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', requestId) };
    }
    const pwErr = validatePassword(body?.password ?? '');
    if (pwErr) {
      return {
        status: 400,
        body: errorBody(
          pwErr,
          pwErr === 'PASSWORD_REQUIRED' ? 'Thiếu mật khẩu.' : `Mật khẩu phải từ ${MIN_PASSWORD_LEN} ký tự.`,
          requestId,
        ),
      };
    }
    await c.env.DB
      .prepare('UPDATE users SET password_hash = ?1, updated_at = ?2 WHERE id = ?3')
      .bind(await hashPassword(body!.password!), new Date().toISOString(), id)
      .run();
    // ADM-003: audit chỉ ghi đã đặt lại, KHÔNG ghi mật khẩu (dùng reason cố định).
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'user.reset_password',
      objectType: 'user',
      objectId: id,
      reason: resetPasswordAuditReason(user.username),
      requestId,
    });
    const dto = await toAdminUserDto(c.env.DB, id);
    return { status: 200, body: { user: dto } };
  });
});

/* ================= Tra cứu (ADM-006) ================= */

/** GET /admin/roles — vai trò kèm quyền + số người dùng. */
adminApp.get('/roles', async (c) => {
  const roles = await listRolesWithPermissions(c.env.DB);
  return c.json({ items: roles });
});

/** GET /admin/positions — danh sách chức vụ kèm đơn vị + số người dùng. */
adminApp.get('/positions', async (c) => {
  const positions = await listPositions(c.env.DB);
  return c.json({
    items: positions.map((p) =>
      toPositionDto(p, p.org_unit_name, p.user_count ?? 0),
    ),
  });
});

/* ================= Đơn vị (org_units) ================= */

/** DTO đầy đủ cho 1 hàng đơn vị (nạp parent/manager names + đếm). */
async function toOrgUnitFullDto(db: D1Database, row: OrgUnitRow): Promise<AdminOrgUnitDto> {
  const all = await listOrgUnits(db);
  const found = all.find((u) => u.id === row.id);
  return found ?? toOrgUnitDto(row, {});
}

/** GET /admin/org-units — danh sách phẳng hoặc cây (?tree=1). */
adminApp.get('/org-units', async (c) => {
  const items = await listOrgUnits(c.env.DB);
  if (c.req.query('tree') === '1') {
    return c.json({ items: buildOrgUnitTree(items), total: items.length });
  }
  return c.json({ items, total: items.length });
});

/** POST /admin/org-units — tạo đơn vị. Idempotent. */
adminApp.post('/org-units', async (c) => {
  const body = await parseJson<CreateOrgUnitBody>(c);
  return withIdempotency(c, 'admin.org_unit.create', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const name = (body?.name ?? '').trim();
    if (!name) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu tên đơn vị.', requestId) };
    }
    if (!body?.type || !isValidOrgUnitType(body.type)) {
      return { status: 400, body: errorBody('INVALID_TYPE', 'Loại đơn vị không hợp lệ (ORG/OFFICE/WAREHOUSE).', requestId) };
    }
    const code = body.code?.trim().toUpperCase() || null;
    if (code && (await orgUnitCodeTaken(c.env.DB, code))) {
      return { status: 409, body: errorBody('ORG_UNIT_CODE_TAKEN', 'Mã đơn vị đã tồn tại.', requestId) };
    }
    const parentId = body.parentId ?? null;
    if (parentId) {
      const parent = await findOrgUnit(c.env.DB, parentId);
      if (!parent) {
        return { status: 400, body: errorBody('ORG_UNIT_PARENT_INVALID', 'Đơn vị cha không tồn tại.', requestId) };
      }
    }
    const managerUserId = body.managerUserId ?? null;
    if (managerUserId && !(await findAdminUser(c.env.DB, managerUserId))) {
      return { status: 400, body: errorBody('USER_NOT_FOUND', 'Người phụ trách không tồn tại.', requestId) };
    }
    const id = newId();
    const row = await createOrgUnit(c.env.DB, {
      id,
      code,
      name,
      type: body.type,
      parentId,
      address: body.address?.trim() || null,
      phone: body.phone?.trim() || null,
      managerUserId,
    });
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'org_unit.create',
      objectType: 'org_unit',
      objectId: id,
      reason: `Tạo đơn vị ${name}${code ? ` (${code})` : ''}`,
      requestId,
    });
    return { status: 201, body: { orgUnit: row ? await toOrgUnitFullDto(c.env.DB, row) : null } };
  });
});

/** PATCH /admin/org-units/:id — sửa đơn vị. Idempotent. */
adminApp.patch('/org-units/:id', async (c) => {
  const body = await parseJson<UpdateOrgUnitBody>(c);
  return withIdempotency(c, 'admin.org_unit.update', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const row = await findOrgUnit(c.env.DB, id);
    if (!row) {
      return { status: 404, body: errorBody('ORG_UNIT_NOT_FOUND', 'Không tìm thấy đơn vị.', requestId) };
    }
    if (!body) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Yêu cầu không hợp lệ.', requestId) };
    }
    const input: Parameters<typeof updateOrgUnit>[2] = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) {
        return { status: 400, body: errorBody('INVALID_REQUEST', 'Tên đơn vị không được rỗng.', requestId) };
      }
      input.name = name;
    }
    if (body.code !== undefined) {
      const code = body.code ? body.code.trim().toUpperCase() : null;
      if (code && code !== row.code && (await orgUnitCodeTaken(c.env.DB, code, id))) {
        return { status: 409, body: errorBody('ORG_UNIT_CODE_TAKEN', 'Mã đơn vị đã tồn tại.', requestId) };
      }
      input.code = code;
    }
    if (body.type !== undefined) {
      if (!isValidOrgUnitType(body.type)) {
        return { status: 400, body: errorBody('INVALID_TYPE', 'Loại đơn vị không hợp lệ (ORG/OFFICE/WAREHOUSE).', requestId) };
      }
      input.type = body.type;
    }
    if (body.parentId !== undefined) {
      if (body.parentId) {
        const parent = await findOrgUnit(c.env.DB, body.parentId);
        if (!parent) {
          return { status: 400, body: errorBody('ORG_UNIT_PARENT_INVALID', 'Đơn vị cha không tồn tại.', requestId) };
        }
        const all = await listOrgUnits(c.env.DB);
        if (isOrgUnitParentCycle(all, id, body.parentId)) {
          return { status: 400, body: errorBody('ORG_UNIT_PARENT_INVALID', 'Đơn vị cha tạo vòng lặp phân cấp.', requestId) };
        }
      }
      input.parentId = body.parentId;
    }
    if (body.address !== undefined) input.address = body.address ? body.address.trim() : null;
    if (body.phone !== undefined) input.phone = body.phone ? body.phone.trim() : null;
    if (body.managerUserId !== undefined) {
      if (body.managerUserId && !(await findAdminUser(c.env.DB, body.managerUserId))) {
        return { status: 400, body: errorBody('USER_NOT_FOUND', 'Người phụ trách không tồn tại.', requestId) };
      }
      input.managerUserId = body.managerUserId;
    }
    if (body.isActive !== undefined) input.isActive = body.isActive;
    const updated = await updateOrgUnit(c.env.DB, id, input);
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'org_unit.update',
      objectType: 'org_unit',
      objectId: id,
      reason: `Cập nhật đơn vị ${row.name}`,
      requestId,
    });
    return { status: 200, body: { orgUnit: updated ? await toOrgUnitFullDto(c.env.DB, updated) : null } };
  });
});

/** DELETE /admin/org-units/:id — xóa đơn vị (chặn khi còn con / đang dùng). Idempotent. */
adminApp.delete('/org-units/:id', async (c) => {
  return withIdempotency(c, 'admin.org_unit.delete', null, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const row = await findOrgUnit(c.env.DB, id);
    if (!row) {
      return { status: 404, body: errorBody('ORG_UNIT_NOT_FOUND', 'Không tìm thấy đơn vị.', requestId) };
    }
    const usage = await orgUnitUsage(c.env.DB, id);
    const err = validateOrgUnitDelete(usage);
    if (err) {
      return {
        status: 409,
        body: errorBody(
          err,
          err === 'ORG_UNIT_HAS_CHILDREN'
            ? 'Đơn vị còn đơn vị con, không xóa được.'
            : 'Đơn vị đang được dùng (người dùng/quy trình/lượt), không xóa được.',
          requestId,
        ),
      };
    }
    await deleteOrgUnit(c.env.DB, id);
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'org_unit.delete',
      objectType: 'org_unit',
      objectId: id,
      reason: `Xóa đơn vị ${row.name}`,
      requestId,
    });
    return { status: 200, body: { deleted: true, id } };
  });
});

/* ================= Chức vụ (positions) ================= */

/** POST /admin/positions — tạo chức vụ. Idempotent. */
adminApp.post('/positions', async (c) => {
  const body = await parseJson<CreatePositionBody>(c);
  return withIdempotency(c, 'admin.position.create', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const code = (body?.code ?? '').trim().toUpperCase();
    const name = (body?.name ?? '').trim();
    if (!code) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu mã chức vụ.', requestId) };
    }
    if (!name) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu tên chức vụ.', requestId) };
    }
    if (await positionCodeTaken(c.env.DB, code)) {
      return { status: 409, body: errorBody('POSITION_CODE_TAKEN', 'Mã chức vụ đã tồn tại.', requestId) };
    }
    const orgUnitId = body?.orgUnitId ?? null;
    if (orgUnitId && !(await findOrgUnit(c.env.DB, orgUnitId))) {
      return { status: 400, body: errorBody('ORG_UNIT_NOT_FOUND', 'Đơn vị không tồn tại.', requestId) };
    }
    const id = newId();
    const row = await createPosition(c.env.DB, {
      id,
      code,
      name,
      description: body?.description?.trim() || null,
      orgUnitId,
    });
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'position.create',
      objectType: 'position',
      objectId: id,
      reason: `Tạo chức vụ ${name} (${code})`,
      requestId,
    });
    if (!row) return { status: 201, body: { position: null } };
    const orgUnitName = row.org_unit_id
      ? (await findOrgUnit(c.env.DB, row.org_unit_id))?.name ?? null
      : null;
    return { status: 201, body: { position: toPositionDto(row, orgUnitName, 0) } };
  });
});

/** PATCH /admin/positions/:id — sửa chức vụ. Idempotent. */
adminApp.patch('/positions/:id', async (c) => {
  const body = await parseJson<UpdatePositionBody>(c);
  return withIdempotency(c, 'admin.position.update', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const row = await findPosition(c.env.DB, id);
    if (!row) {
      return { status: 404, body: errorBody('POSITION_NOT_FOUND', 'Không tìm thấy chức vụ.', requestId) };
    }
    if (!body) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Yêu cầu không hợp lệ.', requestId) };
    }
    const input: Parameters<typeof updatePosition>[2] = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) {
        return { status: 400, body: errorBody('INVALID_REQUEST', 'Tên chức vụ không được rỗng.', requestId) };
      }
      input.name = name;
    }
    if (body.description !== undefined) {
      input.description = body.description ? body.description.trim() : null;
    }
    if (body.orgUnitId !== undefined) {
      if (body.orgUnitId && !(await findOrgUnit(c.env.DB, body.orgUnitId))) {
        return { status: 400, body: errorBody('ORG_UNIT_NOT_FOUND', 'Đơn vị không tồn tại.', requestId) };
      }
      input.orgUnitId = body.orgUnitId;
    }
    if (body.isActive !== undefined) input.isActive = body.isActive;
    const updated = await updatePosition(c.env.DB, id, input);
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'position.update',
      objectType: 'position',
      objectId: id,
      reason: `Cập nhật chức vụ ${row.name}`,
      requestId,
    });
    if (!updated) return { status: 200, body: { position: null } };
    const orgUnitName = updated.org_unit_id
      ? (await findOrgUnit(c.env.DB, updated.org_unit_id))?.name ?? null
      : null;
    const usage = await positionUsage(c.env.DB, id);
    return { status: 200, body: { position: toPositionDto(updated, orgUnitName, usage.userCount) } };
  });
});

/** DELETE /admin/positions/:id — xóa chức vụ (chặn khi đang dùng). Idempotent. */
adminApp.delete('/positions/:id', async (c) => {
  return withIdempotency(c, 'admin.position.delete', null, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const row = await findPosition(c.env.DB, id);
    if (!row) {
      return { status: 404, body: errorBody('POSITION_NOT_FOUND', 'Không tìm thấy chức vụ.', requestId) };
    }
    const usage = await positionUsage(c.env.DB, id);
    const err = validatePositionDelete(usage);
    if (err) {
      return {
        status: 409,
        body: errorBody(err, 'Chức vụ đang được gán cho người dùng hoặc dùng trong bước quy trình.', requestId),
      };
    }
    await deletePosition(c.env.DB, id);
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'position.delete',
      objectType: 'position',
      objectId: id,
      reason: `Xóa chức vụ ${row.name}`,
      requestId,
    });
    return { status: 200, body: { deleted: true, id } };
  });
});

/* ================= Vai trò (roles) ================= */

/** POST /admin/roles — tạo vai trò (+ quyền ban đầu). Idempotent. */
adminApp.post('/roles', async (c) => {
  const body = await parseJson<CreateRoleBody>(c);
  return withIdempotency(c, 'admin.role.create', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const code = (body?.code ?? '').trim().toUpperCase();
    const name = (body?.name ?? '').trim();
    if (!code) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu mã vai trò.', requestId) };
    }
    if (!name) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu tên vai trò.', requestId) };
    }
    if (await roleCodeTaken(c.env.DB, code)) {
      return { status: 409, body: errorBody('ROLE_CODE_TAKEN', 'Mã vai trò đã tồn tại.', requestId) };
    }
    const permissionIds = body?.permissionIds ?? [];
    const badPerms = unknownPermissions(permissionIds);
    if (badPerms.length > 0) {
      return { status: 400, body: errorBody('UNKNOWN_PERMISSION', `Quyền không tồn tại: ${badPerms.join(', ')}.`, requestId) };
    }
    const id = newId();
    const row = await createRole(c.env.DB, {
      id,
      code,
      name,
      description: body?.description?.trim() || null,
      seniorApprover: body?.seniorApprover === true,
      permissionIds,
    });
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'role.create',
      objectType: 'role',
      objectId: id,
      reason: `Tạo vai trò ${name} (${code})`,
      requestId,
    });
    if (!row) return { status: 201, body: { role: null } };
    const perms = await getRolePermissions(c.env.DB, id);
    return { status: 201, body: { role: toRoleDto(row, perms, 0) } };
  });
});

/** PATCH /admin/roles/:id — sửa vai trò (tên, mô tả, duyệt cấp cao). Idempotent. */
adminApp.patch('/roles/:id', async (c) => {
  const body = await parseJson<UpdateRoleBody>(c);
  return withIdempotency(c, 'admin.role.update', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const row = await findRole(c.env.DB, id);
    if (!row) {
      return { status: 404, body: errorBody('ROLE_NOT_FOUND', 'Không tìm thấy vai trò.', requestId) };
    }
    if (!body) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Yêu cầu không hợp lệ.', requestId) };
    }
    const input: Parameters<typeof updateRole>[2] = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) {
        return { status: 400, body: errorBody('INVALID_REQUEST', 'Tên vai trò không được rỗng.', requestId) };
      }
      input.name = name;
    }
    if (body.description !== undefined) {
      input.description = body.description ? body.description.trim() : null;
    }
    if (body.seniorApprover !== undefined) input.seniorApprover = body.seniorApprover;
    const updated = await updateRole(c.env.DB, id, input);
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'role.update',
      objectType: 'role',
      objectId: id,
      reason: `Cập nhật vai trò ${row.name}`,
      requestId,
    });
    if (!updated) return { status: 200, body: { role: null } };
    const perms = await getRolePermissions(c.env.DB, id);
    const usage = await roleUsage(c.env.DB, id);
    return { status: 200, body: { role: toRoleDto(updated, perms, usage.userCount) } };
  });
});

/** DELETE /admin/roles/:id — xóa vai trò (chặn vai trò hệ thống / đang có user). Idempotent. */
adminApp.delete('/roles/:id', async (c) => {
  return withIdempotency(c, 'admin.role.delete', null, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const row = await findRole(c.env.DB, id);
    if (!row) {
      return { status: 404, body: errorBody('ROLE_NOT_FOUND', 'Không tìm thấy vai trò.', requestId) };
    }
    const usage = await roleUsage(c.env.DB, id);
    const err = validateRoleDelete({ isSystem: row.is_system === 1, userCount: usage.userCount });
    if (err) {
      return {
        status: 409,
        body: errorBody(
          err,
          err === 'ROLE_IS_SYSTEM'
            ? 'Vai trò hệ thống không được xóa.'
            : 'Vai trò đang có người dùng giữ, không xóa được.',
          requestId,
        ),
      };
    }
    await deleteRole(c.env.DB, id);
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'role.delete',
      objectType: 'role',
      objectId: id,
      reason: `Xóa vai trò ${row.name}`,
      requestId,
    });
    return { status: 200, body: { deleted: true, id } };
  });
});

/** POST /admin/roles/:id/permissions — gán lại toàn bộ quyền của vai trò. Idempotent. */
adminApp.post('/roles/:id/permissions', async (c) => {
  const body = await parseJson<AssignPermissionsBody>(c);
  return withIdempotency(c, 'admin.role.permissions', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const row = await findRole(c.env.DB, id);
    if (!row) {
      return { status: 404, body: errorBody('ROLE_NOT_FOUND', 'Không tìm thấy vai trò.', requestId) };
    }
    const permissionIds = body?.permissionIds ?? [];
    const badPerms = unknownPermissions(permissionIds);
    if (badPerms.length > 0) {
      return { status: 400, body: errorBody('UNKNOWN_PERMISSION', `Quyền không tồn tại: ${badPerms.join(', ')}.`, requestId) };
    }
    const updated = await setRolePermissions(c.env.DB, id, permissionIds);
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'role.assign_permissions',
      objectType: 'role',
      objectId: id,
      reason: `Gán ${permissionIds.length} quyền cho vai trò ${row.name}`,
      requestId,
    });
    if (!updated) return { status: 200, body: { role: null } };
    const perms = await getRolePermissions(c.env.DB, id);
    const usage = await roleUsage(c.env.DB, id);
    return { status: 200, body: { role: toRoleDto(updated, perms, usage.userCount) } };
  });
});

/* ================= Audit log (ADM-002/004) ================= */

/** GET /admin/audit — tra cứu nhật ký, phân trang (limit tối đa 50). */
adminApp.get('/audit', async (c) => {
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '20', 10) || 20, 1), 50);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);
  const { items, total } = await listAudit(c.env.DB, {
    from: c.req.query('from') || undefined,
    to: c.req.query('to') || undefined,
    actorId: c.req.query('actorId') || undefined,
    action: c.req.query('action') || undefined,
    objectType: c.req.query('objectType') || undefined,
    q: c.req.query('q')?.trim() || undefined,
    limit,
    offset,
  });
  return c.json({
    items: items.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      actorName: r.actor_name,
      action: r.action,
      objectType: r.object_type,
      objectId: r.object_id,
      reason: r.reason,
      flagged: r.flagged === 1,
      requestId: r.request_id,
      createdAt: r.created_at,
    })),
    total,
    limit,
    offset,
  });
});

/* ================= Danh mục lý do (ADM-005) ================= */

/** GET /admin/reasons — danh sách lý do. */
adminApp.get('/reasons', async (c) => {
  const rows = await listReasons(c.env.DB);
  return c.json({ items: rows.map(toReasonDto) });
});

/** POST /admin/reasons — thêm lý do. Idempotent. */
adminApp.post('/reasons', async (c) => {
  const body = await parseJson<CreateReasonBody>(c);
  return withIdempotency(c, 'admin.reason.create', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const code = (body?.code ?? '').trim().toUpperCase();
    const label = (body?.label ?? '').trim();
    const category = body?.category;
    if (!code) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu mã lý do.', requestId) };
    }
    if (!label) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu nhãn lý do.', requestId) };
    }
    if (!category || !isValidCategory(category)) {
      return { status: 400, body: errorBody('INVALID_CATEGORY', 'Nhóm lý do không hợp lệ.', requestId) };
    }
    if (await reasonCodeTaken(c.env.DB, code)) {
      return { status: 409, body: errorBody('REASON_CODE_TAKEN', 'Mã lý do đã tồn tại.', requestId) };
    }
    const id = newId();
    await c.env.DB
      .prepare('INSERT INTO reason_catalog (id, code, category, label) VALUES (?1,?2,?3,?4)')
      .bind(id, code, category, label)
      .run();
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'reason.create',
      objectType: 'reason',
      objectId: id,
      reason: `Thêm lý do ${code} (${category})`,
      requestId,
    });
    const row = await findReason(c.env.DB, id);
    return { status: 201, body: { reason: row ? toReasonDto(row) : null } };
  });
});

/** PATCH /admin/reasons/:id — sửa lý do (nhãn, nhóm, bật/tắt). */
adminApp.patch('/reasons/:id', async (c) => {
  const body = await parseJson<UpdateReasonBody>(c);
  return withIdempotency(c, 'admin.reason.update', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const id = c.req.param('id');
    const row = await findReason(c.env.DB, id);
    if (!row) {
      return { status: 404, body: errorBody('REASON_NOT_FOUND', 'Không tìm thấy lý do.', requestId) };
    }
    if (!body) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Yêu cầu không hợp lệ.', requestId) };
    }
    const updates: string[] = [];
    const binds: unknown[] = [];
    if (body.label !== undefined) {
      const label = body.label.trim();
      if (!label) {
        return { status: 400, body: errorBody('INVALID_REQUEST', 'Nhãn không được rỗng.', requestId) };
      }
      updates.push('label = ?');
      binds.push(label);
    }
    if (body.category !== undefined) {
      if (!isValidCategory(body.category)) {
        return { status: 400, body: errorBody('INVALID_CATEGORY', 'Nhóm lý do không hợp lệ.', requestId) };
      }
      updates.push('category = ?');
      binds.push(body.category);
    }
    if (body.isActive !== undefined) {
      updates.push('is_active = ?');
      binds.push(body.isActive ? 1 : 0);
    }
    if (updates.length === 0) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Không có gì để cập nhật.', requestId) };
    }
    binds.push(id);
    await c.env.DB
      .prepare(`UPDATE reason_catalog SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...binds)
      .run();
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'reason.update',
      objectType: 'reason',
      objectId: id,
      reason: `Cập nhật lý do ${row.code}`,
      requestId,
    });
    const updated = await findReason(c.env.DB, id);
    return { status: 200, body: { reason: updated ? toReasonDto(updated) : null } };
  });
});
