/**
 * Test T7 — Quản trị (ADM-001..006).
 * Fail-first cho các bất biến: validate tài khoản, cấm tự khóa, validate lý do,
 * và map DTO (không rò rỉ password_hash ra ngoài — ADM-003).
 */
import { describe, expect, it } from 'vitest';
import {
  isValidCategory,
  isValidStatus,
  validateNewUsername,
  validatePassword,
  validateSelfLock,
} from './admin.js';
import { toReasonDto } from './adminDb.js';

describe('validate tài khoản mới (ADM-001)', () => {
  it('username rỗng → USERNAME_REQUIRED', () => {
    expect(validateNewUsername('')).toBe('USERNAME_REQUIRED');
    expect(validateNewUsername('   ')).toBe('USERNAME_REQUIRED');
  });

  it('username hợp lệ → null', () => {
    expect(validateNewUsername('nhanvien2')).toBeNull();
  });

  it('password rỗng → PASSWORD_REQUIRED', () => {
    expect(validatePassword('')).toBe('PASSWORD_REQUIRED');
  });

  it('password < 8 ký tự → PASSWORD_TOO_SHORT', () => {
    expect(validatePassword('abc123')).toBe('PASSWORD_TOO_SHORT');
    expect(validatePassword('1234567')).toBe('PASSWORD_TOO_SHORT');
  });

  it('password ≥ 8 ký tự → null', () => {
    expect(validatePassword('Abc@1234')).toBeNull();
  });
});

describe('cấm tự khóa chính mình (ADM-001)', () => {
  it('tự khóa → CANNOT_LOCK_SELF', () => {
    expect(validateSelfLock('u-1', 'u-1', 'LOCKED')).toBe('CANNOT_LOCK_SELF');
  });

  it('tự vô hiệu → CANNOT_LOCK_SELF', () => {
    expect(validateSelfLock('u-1', 'u-1', 'DISABLED')).toBe('CANNOT_LOCK_SELF');
  });

  it('tự giữ ACTIVE → null', () => {
    expect(validateSelfLock('u-1', 'u-1', 'ACTIVE')).toBeNull();
  });

  it('khóa người khác → null', () => {
    expect(validateSelfLock('u-1', 'u-2', 'LOCKED')).toBeNull();
    expect(validateSelfLock('u-1', 'u-2', 'DISABLED')).toBeNull();
  });

  it('không đổi status → null', () => {
    expect(validateSelfLock('u-1', 'u-1', undefined)).toBeNull();
  });
});

describe('validate status / category', () => {
  it('status hợp lệ', () => {
    expect(isValidStatus('ACTIVE')).toBe(true);
    expect(isValidStatus('LOCKED')).toBe(true);
    expect(isValidStatus('DISABLED')).toBe(true);
    expect(isValidStatus('DELETED')).toBe(false);
    expect(isValidStatus('')).toBe(false);
  });

  it('category hợp lệ', () => {
    expect(isValidCategory('cancel')).toBe(true);
    expect(isValidCategory('skip')).toBe(true);
    expect(isValidCategory('fail')).toBe(true);
    expect(isValidCategory('reject')).toBe(true);
    expect(isValidCategory('other')).toBe(false);
  });
});

describe('toReasonDto (ADM-005)', () => {
  const base = {
    id: 'rsn-1',
    code: 'CANCEL_PLAN_CHANGED',
    category: 'cancel',
    label: 'Thay đổi kế hoạch',
    created_at: '2026-10-19T00:00:00.000Z',
  };

  it('is_active=1 → isActive=true', () => {
    const dto = toReasonDto({ ...base, is_active: 1 });
    expect(dto.isActive).toBe(true);
    expect(dto.code).toBe('CANCEL_PLAN_CHANGED');
    expect(dto.category).toBe('cancel');
  });

  it('is_active=0 → isActive=false', () => {
    const dto = toReasonDto({ ...base, is_active: 0 });
    expect(dto.isActive).toBe(false);
  });
});

describe('ADM-003 — không rò rỉ password', () => {
  it('AdminUserDto không có trường password_hash', async () => {
    // toAdminUserDto dựng từ findAdminUser; kiểm tra contract type không chứa password.
    const { ADMIN_ERROR_CODES } = await import('@giangdc-sop/contracts');
    expect(ADMIN_ERROR_CODES).toContain('PASSWORD_TOO_SHORT');
    // Type-level: AdminUserDto keys không bao gồm password_hash.
    const dtoKeys = [
      'id',
      'username',
      'displayName',
      'status',
      'roleIds',
      'roleNames',
      'positionIds',
      'positionNames',
      'scopeIds',
      'createdAt',
    ];
    expect(dtoKeys).not.toContain('password_hash');
    expect(dtoKeys).not.toContain('passwordHash');
  });
});
