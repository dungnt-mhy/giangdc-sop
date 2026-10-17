import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  effectivePermissions,
  hasScope,
  hashPassword,
  newSessionToken,
  sha256Hex,
  verifyPassword,
  type SystemRole,
} from '@giangdc-sop/domain';
import {
  createSession,
  deleteSessionByTokenHash,
  findSession,
  findUserByUsername,
  getUserRoles,
  getUserScopes,
  writeAudit,
} from './db.js';
import { errorBody, requireAuth } from './middleware.js';
import type { AppEnv, AuthSession } from './env.js';

const SESSION_COOKIE = 'sop_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function newId(): string {
  return crypto.randomUUID();
}

export const authApp = new Hono<AppEnv>();

/** POST /auth/login — đăng nhập nội bộ một lớp (D-02). */
authApp.post('/login', async (c) => {
  const requestId = c.get('requestId') as string;
  let body: { username?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody('INVALID_REQUEST', 'Yêu cầu không hợp lệ.', requestId), 400);
  }
  const username = (body.username ?? '').trim();
  const password = body.password ?? '';
  if (!username || !password) {
    return c.json(errorBody('INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng.', requestId), 401);
  }

  const user = await findUserByUsername(c.env.DB, username);
  const passwordOk = user ? await verifyPassword(password, user.password_hash) : false;
  // Chống user-enumeration: luôn chạy verify với hash giả khi user không tồn tại.
  if (!user) await verifyPassword(password, await hashPassword('dummy'));
  if (!user || !passwordOk) {
    return c.json(errorBody('INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng.', requestId), 401);
  }
  if (user.status !== 'ACTIVE') {
    return c.json(errorBody('ACCOUNT_DISABLED', 'Tài khoản đã bị khóa hoặc vô hiệu.', requestId), 403);
  }

  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await createSession(c.env.DB, newId(), user.id, tokenHash, expiresAt);
  await writeAudit(c.env.DB, {
    id: newId(),
    actorId: user.id,
    action: 'auth.login',
    requestId,
  });

  const roles = (await getUserRoles(c.env.DB, user.id)) as SystemRole[];
  // Demo: web (pages.dev) và API (workers.dev) khác site, trình duyệt chỉ gửi
  // cookie trong fetch cross-site khi SameSite=None. Production cùng origin
  // sẽ dùng Lax để giảm rủi ro CSRF.
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return c.json({
    user: { id: user.id, username: user.username, displayName: user.display_name },
    roles,
  });
});

/** POST /auth/logout */
authApp.post('/logout', async (c) => {
  const requestId = c.get('requestId') as string;
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const session = await findSession(c.env.DB, await sha256Hex(token));
    await deleteSessionByTokenHash(c.env.DB, await sha256Hex(token));
    if (session) {
      await writeAudit(c.env.DB, {
        id: newId(),
        actorId: session.user_id,
        action: 'auth.logout',
        requestId,
      });
    }
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

/** GET /auth/me — thông tin phiên + quyền + scope (BR-013: client không tự suy quyền). */
authApp.get('/me', requireAuth, async (c) => {
  const session = c.get('session') as AuthSession;
  const roles = (await getUserRoles(c.env.DB, session.user_id)) as SystemRole[];
  const scopes = await getUserScopes(c.env.DB, session.user_id);
  return c.json({
    user: { id: session.user_id, username: session.username, displayName: session.display_name },
    roles,
    permissions: [...effectivePermissions(roles)],
    scopes,
  });
});

/** GET /auth/check-scope — kiểm tra quyền trên một đơn vị (AC-06). */
authApp.get('/check-scope', requireAuth, async (c) => {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const orgUnitId = c.req.query('orgUnitId') ?? '';
  if (!orgUnitId) {
    return c.json(errorBody('INVALID_REQUEST', 'Thiếu orgUnitId.', requestId), 400);
  }
  const scopes = await getUserScopes(c.env.DB, session.user_id);
  const allowed = hasScope(
    scopes.map((orgUnitId) => ({ userId: session.user_id, orgUnitId })),
    orgUnitId,
  );
  if (!allowed) {
    await writeAudit(c.env.DB, {
      id: newId(),
      actorId: session.user_id,
      action: 'security.access_denied_scope',
      objectType: 'org_unit',
      objectId: orgUnitId,
      requestId,
    });
    return c.json(errorBody('FORBIDDEN_SCOPE', 'Không có quyền trên đơn vị này.', requestId), 403);
  }
  return c.json({ allowed: true, orgUnitId });
});
