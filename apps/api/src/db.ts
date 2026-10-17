/** Kiểu binding của Worker (khớp wrangler.toml). */
export interface Env {
  DB: D1Database;
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

export async function getUserRoles(db: D1Database, userId: string): Promise<string[]> {
  const rows = await db
    .prepare('SELECT role FROM user_system_roles WHERE user_id = ?1')
    .bind(userId)
    .all<{ role: string }>();
  return (rows.results ?? []).map((r) => r.role);
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
