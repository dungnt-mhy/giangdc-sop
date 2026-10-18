
/* ---------- Notifications (D-15) ---------- */

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ref_type: string | null;
  ref_id: string | null;
  is_read: number;
  created_at: string;
}

function newNotifId(): string {
  return crypto.randomUUID();
}

/**
 * Tạo thông báo cho user (D-15). Bỏ qua lặng lẽ nếu user không tồn tại
 * (tránh chặn luồng nghiệp vụ chính vì lỗi thông báo).
 */
export async function createNotification(
  db: D1Database,
  userId: string,
  type: string,
  title: string,
  body: string | null,
  refType: string | null,
  refId: string | null,
): Promise<void> {
  const user = await db
    .prepare('SELECT id FROM users WHERE id = ?1')
    .bind(userId)
    .first<{ id: string }>();
  if (!user) return;
  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, ref_type, ref_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(newNotifId(), userId, type, title, body, refType, refId)
    .run();
}

export function toNotificationDto(r: NotificationRow): import('@giangdc-sop/contracts').NotificationDto {
  return {
    id: r.id,
    type: r.type as import('@giangdc-sop/contracts').NotificationDto['type'],
    title: r.title,
    body: r.body,
    refType: r.ref_type,
    refId: r.ref_id,
    isRead: r.is_read === 1,
    createdAt: r.created_at,
  };
}

export async function listNotifications(
  db: D1Database,
  userId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  const rows = await db
    .prepare(
      `SELECT id, type, title, body, ref_type, ref_id, is_read, created_at
       FROM notifications WHERE user_id = ?1
       ORDER BY is_read ASC, created_at DESC LIMIT ?2`,
    )
    .bind(userId, Math.min(Math.max(limit, 1), 200))
    .all<NotificationRow>();
  return rows.results ?? [];
}

export async function countUnreadNotifications(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?1 AND is_read = 0')
    .bind(userId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function markNotificationRead(
  db: D1Database,
  userId: string,
  notifId: string,
): Promise<boolean> {
  const res = await db
    .prepare('UPDATE notifications SET is_read = 1 WHERE id = ?1 AND user_id = ?2 AND is_read = 0')
    .bind(notifId, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/**
 * Số lượt PENDING_APPROVAL mà user được duyệt (D-15, cho badge menu):
 * user là supervisor của lượt, hoặc có vai trò senior_approver.
 */
export async function countPendingApprovalsFor(
  db: D1Database,
  userId: string,
  isSenior: boolean,
): Promise<number> {
  if (isSenior) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS c FROM executions WHERE state = 'PENDING_APPROVAL'`)
      .first<{ c: number }>();
    return row?.c ?? 0;
  }
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM executions WHERE state = 'PENDING_APPROVAL' AND supervisor_id = ?1`,
    )
    .bind(userId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/** Danh sách user id có vai trò senior_approver (D-10) — để notify khi lượt không có supervisor. */
export async function listSeniorApproverIds(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT ur.user_id AS uid FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id WHERE r.senior_approver = 1`,
    )
    .all<{ uid: string }>();
  return (rows.results ?? []).map((r) => r.uid);
}
