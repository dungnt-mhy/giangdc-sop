/**
 * Module Quản trị (T7): tài khoản, vai trò, danh mục lý do, audit log.
 * SRS v1.6: ADM-001..006. Tất cả endpoint yêu cầu quyền `user.manage`.
 *
 * ADM-003: KHÔNG BAO GIỜ ghi password/token vào audit — các audit dưới đây
 * chỉ ghi action + object, không kèm body chứa password.
 */
import { Hono } from 'hono';
import { hashPassword } from '@giangdc-sop/domain';
import type {
  AdminUserDto,
  AssignPositionsBody,
  AssignRolesBody,
  CreateReasonBody,
  CreateUserBody,
  ReasonCategory,
  UpdateReasonBody,
  UpdateUserBody,
  UserStatus,
} from '@giangdc-sop/contracts';
import {
  findAdminUser,
  findReason,
  getUserPositionIds,
  getUserRoleIds,
  listAdminUsers,
  listAudit,
  listPositions,
  listReasons,
  listRolesWithPermissions,
  reasonCodeTaken,
  setUserPositions,
  setUserRoles,
  setUserScopes,
  toReasonDto,
  unknownPositionIds,
  unknownRoleIds,
  unknownScopeIds,
  usernameTaken,
} from './adminDb.js';
import { getUserScopes, writeAudit } from './db.js';
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
    getUserScopes(db, userId),
  ]);
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    status: u.status as UserStatus,
    roleIds: roles.map((r) => r.id),
    roleNames: roles.map((r) => r.name),
    positionIds: positions.map((p) => p.id),
    positionNames: positions.map((p) => p.name),
    scopeIds: scopes,
    createdAt: u.created_at,
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
      .prepare('INSERT INTO users (id, username, display_name, password_hash, status) VALUES (?1,?2,?3,?4,\'ACTIVE\')')
      .bind(id, username, displayName, await hashPassword(password))
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

/* ================= Tra cứu (ADM-006) ================= */

/** GET /admin/roles — vai trò kèm quyền (read-only). */
adminApp.get('/roles', async (c) => {
  const roles = await listRolesWithPermissions(c.env.DB);
  return c.json({
    items: roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      seniorApprover: r.senior_approver === 1,
      permissions: r.permissions,
    })),
  });
});

/** GET /admin/positions — danh sách chức vụ (để gán cho user). */
adminApp.get('/positions', async (c) => {
  const positions = await listPositions(c.env.DB);
  return c.json({
    items: positions.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      orgUnitId: p.org_unit_id,
    })),
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
