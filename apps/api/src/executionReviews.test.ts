/**
 * Test D-18: nhật ký duyệt lượt thực hiện (execution_reviews).
 * Dùng fake D1Database tối thiểu — kiểm tra SQL/bind và mapping DTO.
 */
import { describe, expect, it } from 'vitest';
import { addExecutionReview, lastRejectKindOf, listExecutionReviews } from './executionDb.js';

interface RecordedCall {
  sql: string;
  binds: unknown[];
}

function makeFakeDb(allResults: unknown[] = []) {
  const calls: RecordedCall[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql, binds });
          return {
            async run() {
              return { success: true };
            },
            async all<T>() {
              return { results: allResults as T[] };
            },
          };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, calls };
}

describe('addExecutionReview', () => {
  it('INSERT đúng bảng, cột và thứ tự binds', async () => {
    const { db, calls } = makeFakeDb();
    await addExecutionReview(db, {
      executionId: 'ex-1',
      action: 'reject',
      actorId: 'u-pheduyet',
      reason: 'Thiếu ảnh bước 3',
    });
    expect(calls).toHaveLength(1);
    const { sql, binds } = calls[0];
    expect(sql).toContain('INSERT INTO execution_reviews');
    expect(sql).toContain('execution_id, action, actor_id, reason, step_ids, created_at');
    expect(binds[1]).toBe('ex-1');
    expect(binds[2]).toBe('reject');
    expect(binds[3]).toBe('u-pheduyet');
    expect(binds[4]).toBe('Thiếu ảnh bước 3');
    expect(binds[5]).toBeNull(); // step_ids null khi không truyền
    expect(typeof binds[0]).toBe('string'); // id
    expect(typeof binds[6]).toBe('string'); // created_at ISO
  });

  it('reason null khi không truyền', async () => {
    const { db, calls } = makeFakeDb();
    await addExecutionReview(db, { executionId: 'ex-1', action: 'submit', actorId: 'u-admin' });
    expect(calls[0].binds[4]).toBeNull();
  });

  it('D-21: stepIds được lưu dạng JSON', async () => {
    const { db, calls } = makeFakeDb();
    await addExecutionReview(db, {
      executionId: 'ex-1',
      action: 'reject',
      actorId: 'u-pheduyet',
      reason: 'Làm lại bước 2, 3',
      stepIds: ['s2', 's3'],
    });
    expect(calls[0].binds[5]).toBe(JSON.stringify(['s2', 's3']));
  });
});

describe('listExecutionReviews', () => {
  it('map đúng DTO, mới nhất trước, kèm tên người làm', async () => {
    const { db, calls } = makeFakeDb([
      { id: 'r2', action: 'reject', actor_id: 'u-pheduyet', actor_name: 'Người Phê duyệt', reason: 'Làm lại', created_at: '2026-10-18T10:12:52.751Z' },
      { id: 'r1', action: 'submit', actor_id: 'u-admin', actor_name: 'Admin Hệ thống', reason: null, created_at: '2026-10-18T09:00:00.000Z' },
    ]);
    const reviews = await listExecutionReviews(db, 'ex-1');
    expect(calls[0].sql).toContain('ORDER BY r.created_at DESC');
    expect(calls[0].sql).toContain('LEFT JOIN users');
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatchObject({
      id: 'r2',
      action: 'reject',
      actorId: 'u-pheduyet',
      actorName: 'Người Phê duyệt',
      reason: 'Làm lại',
      createdAt: '2026-10-18T10:12:52.751Z',
    });
    expect(reviews[1].action).toBe('submit');
  });

  it('trả mảng rỗng khi chưa có review', async () => {
    const { db } = makeFakeDb([]);
    expect(await listExecutionReviews(db, 'ex-1')).toEqual([]);
  });

  it('D-21: parse step_ids JSON thành stepIds', async () => {
    const { db } = makeFakeDb([
      { id: 'r1', action: 'reject', actor_id: 'u-pheduyet', actor_name: 'Người Phê duyệt', reason: 'Làm lại', step_ids: '["s2","s3"]', created_at: '2026-10-18T10:12:52.751Z' },
      { id: 'r2', action: 'reject', actor_id: 'u-pheduyet', actor_name: 'Người Phê duyệt', reason: 'Trả hết', step_ids: null, created_at: '2026-10-18T09:00:00.000Z' },
    ]);
    const reviews = await listExecutionReviews(db, 'ex-1');
    expect(reviews[0].stepIds).toEqual(['s2', 's3']);
    expect(reviews[1].stepIds).toBeNull();
  });

  it('D-21: step_ids JSON hỏng -> null', async () => {
    const { db } = makeFakeDb([
      { id: 'r1', action: 'reject', actor_id: 'u-x', actor_name: null, reason: null, step_ids: 'not-json', created_at: '2026-10-18T10:00:00.000Z' },
    ]);
    const reviews = await listExecutionReviews(db, 'ex-1');
    expect(reviews[0].stepIds).toBeNull();
  });
});

describe('lastRejectKindOf (D-21b)', () => {
  it('reject theo bước -> "steps"', () => {
    expect(lastRejectKindOf([{ action: 'reject', stepIds: ['s2'] }])).toBe('steps');
  });
  it('reject cả lượt (stepIds null) -> "all"', () => {
    expect(lastRejectKindOf([{ action: 'reject', stepIds: null }])).toBe('all');
  });
  it('review gần nhất không phải reject -> null', () => {
    expect(lastRejectKindOf([{ action: 'approve', stepIds: null }])).toBeNull();
    expect(lastRejectKindOf([{ action: 'submit', stepIds: ['s1'] }])).toBeNull();
  });
  it('không có review -> null', () => {
    expect(lastRejectKindOf([])).toBeNull();
  });
});
