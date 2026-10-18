/**
 * Test D-20b: "Đã hủy" là cờ voided_at/void_reason (không phải state VOID).
 * Dùng fake row — kiểm tra toVersionDto map đúng 2 cột mới.
 */
import { describe, expect, it } from 'vitest';
import { toVersionDto } from './processDb.js';

function baseRow(over: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    process_id: 'p-1',
    version_no: 3,
    state: 'RETIRED',
    change_summary: 'Sửa bước 2',
    change_size: 'MINOR',
    impact_assessment: null,
    effective_from: null,
    created_by: 'u-admin',
    created_by_name: 'Admin',
    revision: 5,
    created_at: '2026-10-18T08:00:00.000Z',
    updated_at: '2026-10-18T09:00:00.000Z',
    voided_at: null,
    void_reason: null,
    ...over,
  };
}

describe('toVersionDto — cờ hủy bỏ (D-20b)', () => {
  it('version chưa hủy: voidedAt/voidReason = null', () => {
    const dto = toVersionDto(baseRow() as never);
    expect(dto.voidedAt).toBeNull();
    expect(dto.voidReason).toBeNull();
    expect(dto.state).toBe('RETIRED');
  });

  it('version đã hủy: map đủ thời điểm + lý do, giữ nguyên state', () => {
    const dto = toVersionDto(
      baseRow({ voided_at: '2026-10-18T12:00:00.000Z', void_reason: 'Trùng nội dung v4' }) as never,
    );
    expect(dto.voidedAt).toBe('2026-10-18T12:00:00.000Z');
    expect(dto.voidReason).toBe('Trùng nội dung v4');
    // D-20b: state giữ nguyên (SUPERSEDED/RETIRED), UI suy badge "Đã hủy" từ flag.
    expect(dto.state).toBe('RETIRED');
  });
});
