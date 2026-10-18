/**
 * DB helpers cho module Quản trị (T7: ADM-001..006).
 * Truy vấn trực tiếp bảng users / roles / positions / audit_events / reason_catalog.
 */
import type { ReasonCategory, UserStatus } from '@giangdc-sop/contracts';
import type { DbRole, DbUser } from './db.js';

export interface AdminUserRow {
  id: string;
  username: string;
  display_name: string;
  status: string;
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
      `SELECT id, username, display_name, status, created_at
       FROM users ${where} ORDER BY created_at DESC`,
    )
    .bind(...binds)
    .all<AdminUserRow>();
  return rows.results ?? [];
}

export interface DbUserWithCreated extends DbUser {
  created_at: string;
}

export async function findAdminUser(db: D1Database, id: string): Promise<DbUserWithCreated | null> {
  return db
    .prepare(
      'SELECT id, username, display_name, password_hash, status, created_at FROM users WHERE id = ?1',
    )
    .bind(id)
    .first<DbUserWithCreated>();
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

/** Vai trò kèm danh sách quyền — tra cứu read-only (ADM-006). */
export async function listRolesWithPermissions(
  db: D1Database,
): Promise<(DbRole & { permissions: string[] })[]> {
  const roles = await db
    .prepare('SELECT id, code, name, senior_approver FROM roles ORDER BY name ASC')
    .all<DbRole>();
  const out: (DbRole & { permissions: string[] })[] = [];
  for (const r of roles.results ?? []) {
    const perms = await db
      .prepare('SELECT permission FROM role_permissions WHERE role_id = ?1 ORDER BY permission ASC')
      .bind(r.id)
      .all<{ permission: string }>();
    out.push({ ...r, permissions: (perms.results ?? []).map((p) => p.permission) });
  }
  return out;
}

export interface PositionRow {
  id: string;
  code: string;
  name: string;
  org_unit_id: string | null;
}

export async function listPositions(db: D1Database): Promise<PositionRow[]> {
  const rows = await db
    .prepare('SELECT id, code, name, org_unit_id FROM positions ORDER BY name ASC')
    .all<PositionRow>();
  return rows.results ?? [];
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
