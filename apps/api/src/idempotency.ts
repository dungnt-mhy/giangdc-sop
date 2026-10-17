import { sha256Hex } from '@giangdc-sop/domain';

/**
 * Idempotency cho mutation (BR-008/BR-014, SRS §12.2).
 *
 * - Endpoint REQUIRED phải gửi header Idempotency-Key; thiếu -> 400.
 * - Cùng key + cùng fingerprint (actor + operation + method + path + body)
 *   -> trả lại response đã lưu (không tạo kết quả nghiệp vụ trùng).
 * - Cùng key + fingerprint khác -> 409 IDEMPOTENCY_CONFLICT.
 */
export type PrecheckResult =
  | { status: 'missing' }
  | { status: 'replay'; responseStatus: number; responseBody: string }
  | { status: 'conflict' }
  | { status: 'proceed'; fingerprint: string };

export async function idempotencyPrecheck(
  db: D1Database,
  key: string | null,
  actorId: string,
  operation: string,
  method: string,
  path: string,
  rawBody: string,
): Promise<PrecheckResult> {
  if (!key) return { status: 'missing' };
  const fingerprint = await sha256Hex(`${actorId}|${operation}|${method}|${path}|${rawBody}`);
  const row = await db
    .prepare('SELECT fingerprint, response_status, response_body FROM idempotency_keys WHERE key = ?1')
    .bind(key)
    .first<{ fingerprint: string; response_status: number; response_body: string }>();
  if (!row) return { status: 'proceed', fingerprint };
  if (row.fingerprint !== fingerprint) return { status: 'conflict' };
  return { status: 'replay', responseStatus: row.response_status, responseBody: row.response_body };
}

export async function idempotencyStore(
  db: D1Database,
  key: string,
  actorId: string,
  operation: string,
  fingerprint: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO idempotency_keys
       (key, actor_id, operation, fingerprint, response_status, response_body)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(key, actorId, operation, fingerprint, responseStatus, JSON.stringify(responseBody))
    .run();
}
