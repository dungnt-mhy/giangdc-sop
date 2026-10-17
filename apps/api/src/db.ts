/** Kiểu binding của Worker (khớp wrangler.toml). */
export interface Env {
  DB: D1Database;
  /** Bucket R2 lưu bằng chứng (T3/T4). */
  EVIDENCE: R2Bucket;
  CORS_ORIGIN?: string;
}

export interface DbUser {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  status: string;
}

export async function findUserByUsername(db: D1Database, username: string): Promise<DbUser | null> {
  return db
    .prepare('SELECT id, username, display_name, password_hash, status FROM users WHERE username = ?1')
    .bind(username)
    .first<DbUser>();
}

export interface DbRole {
  id: string;
  code: string;
  name: string;
  senior_approver: number;
}

/** Vai trò ứng dụng của user (D-10: bảng `roles`, thêm tùy ý). */
export async function getUserRoles(db: D1Database, userId: string): Promise<DbRole[]> {
  const rows = await db
    .prepare(
      `SELECT r.id, r.code, r.name, r.senior_approver
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?1 ORDER BY r.name ASC`,
    )
    .bind(userId)
    .all<DbRole>();
  return rows.results ?? [];
}

/** Quyền hiệu lực + cờ senior của user (D-10: hợp từ `role_permissions`). */
export async function getUserPermissions(
  db: D1Database,
  userId: string,
): Promise<{ permissions: Set<string>; seniorApprover: boolean }> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT rp.permission, r.senior_approver
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN role_permissions rp ON rp.role_id = r.id
       WHERE ur.user_id = ?1`,
    )
    .bind(userId)
    .all<{ permission: string; senior_approver: number }>();
  const permissions = new Set<string>();
  let seniorApprover = false;
  for (const row of rows.results ?? []) {
    permissions.add(row.permission);
    if (row.senior_approver) seniorApprover = true;
  }
  return { permissions, seniorApprover };
}

/** Chức vụ của user (D-09). */
export async function getUserPositions(
  db: D1Database,
  userId: string,
): Promise<{ id: string; code: string; name: string }[]> {
  const rows = await db
    .prepare(
      `SELECT p.id, p.code, p.name
       FROM user_positions up JOIN positions p ON p.id = up.position_id
       WHERE up.user_id = ?1 ORDER BY p.name ASC`,
    )
    .bind(userId)
    .all<{ id: string; code: string; name: string }>();
  return rows.results ?? [];
}

/** Danh sách vai trò ứng dụng (D-10) — dùng cho select động. */
export async function listRoles(db: D1Database): Promise<DbRole[]> {
  const rows = await db
    .prepare('SELECT id, code, name, senior_approver FROM roles ORDER BY name ASC')
    .all<DbRole>();
  return rows.results ?? [];
}

/** Kiểm tra các mã vai trò có tồn tại; trả về danh sách mã KHÔNG tồn tại. */
export async function unknownRoleCodes(db: D1Database, codes: string[]): Promise<string[]> {
  const clean = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  if (clean.length === 0) return [];
  const placeholders = clean.map((_, i) => `?${i + 1}`).join(',');
  const rows = await db
    .prepare(`SELECT code FROM roles WHERE code IN (${placeholders})`)
    .bind(...clean)
    .all<{ code: string }>();
  const found = new Set((rows.results ?? []).map((r) => r.code));
  return clean.filter((c) => !found.has(c));
}

export async function getUserScopes(db: D1Database, userId: string): Promise<string[]> {
  const rows = await db
    .prepare('SELECT org_unit_id FROM user_scopes WHERE user_id = ?1')
    .bind(userId)
    .all<{ org_unit_id: string }>();
  return (rows.results ?? []).map((r) => r.org_unit_id);
}

export async function createSession(
  db: D1Database,
  sessionId: string,
  userId: string,
  tokenHash: string,
  expiresAt: string,
): Promise<void> {
  await db
    .prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(sessionId, userId, tokenHash, expiresAt)
    .run();
}

export async function deleteSessionByTokenHash(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run();
}

export interface SessionRow {
  session_id: string;
  user_id: string;
  username: string;
  display_name: string;
  status: string;
  expires_at: string;
}

export async function findSession(
  db: D1Database,
  tokenHash: string,
): Promise<SessionRow | null> {
  return db
    .prepare(
      `SELECT s.id AS session_id, s.user_id, u.username, u.display_name, u.status, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?1 AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    )
    .bind(tokenHash)
    .first<SessionRow>();
}

export async function writeAudit(
  db: D1Database,
  entry: {
    id: string;
    actorId: string | null;
    action: string;
    objectType?: string;
    objectId?: string;
    reason?: string;
    flagged?: boolean;
    requestId?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_events (id, actor_id, action, object_type, object_id, reason, flagged, request_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      entry.id,
      entry.actorId,
      entry.action,
      entry.objectType ?? null,
      entry.objectId ?? null,
      entry.reason ?? null,
      entry.flagged ? 1 : 0,
      entry.requestId ?? null,
    )
    .run();
}
