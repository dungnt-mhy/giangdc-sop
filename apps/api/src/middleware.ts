import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import {
  hasPermission,
  sha256Hex,
  type Permission,
  type SystemRole,
} from '@giangdc-sop/domain';
import { findSession, getUserRoles } from './db.js';
import type { AppEnv, AuthSession } from './env.js';

/** Body lỗi chuẩn (SRS §12.2): mã máy đọc + thông điệp an toàn + request ID. */
export function errorBody(code: string, message: string, requestId: string) {
  return { code, message, requestId };
}

/** Gán request ID cho mọi request. */
export const requestId = createMiddleware(async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
  c.header('X-Request-Id', c.get('requestId') as string);
});

/** Đọc session từ cookie; gắn vào context. Chưa đăng nhập -> 401. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.get('requestId') as string;
  const token = getCookie(c, 'sop_session');
  if (!token) {
    return c.json(errorBody('UNAUTHENTICATED', 'Chưa đăng nhập.', requestId), 401);
  }
  const session = await findSession(c.env.DB, await sha256Hex(token));
  if (!session) {
    return c.json(errorBody('UNAUTHENTICATED', 'Phiên đã hết hạn hoặc không hợp lệ.', requestId), 401);
  }
  const authSession: AuthSession = {
    session_id: session.session_id,
    user_id: session.user_id,
    username: session.username,
    display_name: session.display_name,
  };
  c.set('session', authSession);
  const roles = (await getUserRoles(c.env.DB, session.user_id)) as SystemRole[];
  c.set('roles', roles);
  await next();
});

/** Yêu cầu một permission cụ thể (kiểm tra phía server, SRS §5). */
export function requirePermission(permission: Permission) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const requestId = c.get('requestId') as string;
    const roles = (c.get('roles') ?? []) as SystemRole[];
    if (!hasPermission(roles, permission)) {
      return c.json(errorBody('FORBIDDEN', 'Không đủ quyền thực hiện thao tác này.', requestId), 403);
    }
    await next();
  });
}
