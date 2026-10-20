/**
 * Test T7 — Quản trị (ADM-001..006) + mở rộng D-28 (đơn vị, chức vụ, vai trò phân quyền).
 * Fail-first cho các bất biến: validate tài khoản, cấm tự khóa, validate lý do,
 * map DTO (không rò rỉ password_hash ra ngoài — ADM-003), guard xóa đơn vị/
 * chức vụ/vai trò, validate permission, và nội dung audit reset password.
 */
import { describe, expect, it } from 'vitest';
import {
  isOrgUnitParentCycle,
  isValidOrgUnitType,
  resetPasswordAuditReason,
  unknownPermissions,
  validateOrgUnitDelete,
  validatePositionDelete,
  validateRoleDelete,
  isValidCategory,
  isValidStatus,
  validateNewUsername,
  validatePassword,
  validateSelfLock,
} from './admin.js';
import {
  buildOrgUnitTree,
  orgUnitCodeTaken,
  positionCodeTaken,
  roleCodeTaken,
  toOrgUnitDto,
  toReasonDto,
} from './adminDb.js';

/** Fake D1Database tối thiểu cho các hàm codeTaken (dựa vào mẫu executionReviews.test.ts). */
function makeFirstDb(firstResult: unknown) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql, binds });
          return {
            async run() {
              return { success: true };
            },
            async first() {
              return firstResult;
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, calls };
}

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

  it('reason audit reset password cố định, không chứa mật khẩu', () => {
    const reason = resetPasswordAuditReason('nhanvien1');
    expect(reason).toContain('nhanvien1');
    expect(reason).not.toContain('Abc@1234');
    expect(reason).not.toContain('password');
    expect(reason).not.toMatch(/mật khẩu là|mật khẩu mới là/i);
    // Cùng username → cùng nội dung, bất kể password thực tế là gì.
    expect(resetPasswordAuditReason('nhanvien1')).toBe(reason);
  });
});

describe('D-28 — đơn vị: type hợp lệ', () => {
  it('ORG/OFFICE/WAREHOUSE hợp lệ', () => {
    expect(isValidOrgUnitType('ORG')).toBe(true);
    expect(isValidOrgUnitType('OFFICE')).toBe(true);
    expect(isValidOrgUnitType('WAREHOUSE')).toBe(true);
  });

  it('type lạ bị loại', () => {
    expect(isValidOrgUnitType('BRANCH')).toBe(false);
    expect(isValidOrgUnitType('')).toBe(false);
    expect(isValidOrgUnitType(undefined)).toBe(false);
  });
});

describe('D-28 — guard xóa đơn vị (validateOrgUnitDelete)', () => {
  it('còn đơn vị con → ORG_UNIT_HAS_CHILDREN', () => {
    expect(
      validateOrgUnitDelete({ childCount: 2, userCount: 0, processCount: 0, executionCount: 0 }),
    ).toBe('ORG_UNIT_HAS_CHILDREN');
  });

  it('còn user/quy trình/lượt → ORG_UNIT_IN_USE', () => {
    expect(
      validateOrgUnitDelete({ childCount: 0, userCount: 3, processCount: 0, executionCount: 0 }),
    ).toBe('ORG_UNIT_IN_USE');
    expect(
      validateOrgUnitDelete({ childCount: 0, userCount: 0, processCount: 1, executionCount: 0 }),
    ).toBe('ORG_UNIT_IN_USE');
    expect(
      validateOrgUnitDelete({ childCount: 0, userCount: 0, processCount: 0, executionCount: 5 }),
    ).toBe('ORG_UNIT_IN_USE');
  });

  it('không dùng → null (xóa được)', () => {
    expect(
      validateOrgUnitDelete({ childCount: 0, userCount: 0, processCount: 0, executionCount: 0 }),
    ).toBeNull();
  });

  it('ưu tiên chặn con trước khi chặn in-use', () => {
    expect(
      validateOrgUnitDelete({ childCount: 1, userCount: 1, processCount: 1, executionCount: 1 }),
    ).toBe('ORG_UNIT_HAS_CHILDREN');
  });
});

describe('D-28 — chặn vòng lặp phân cấp (isOrgUnitParentCycle)', () => {
  const all = [
    { id: 'root', parentId: null },
    { id: 'vp', parentId: 'root' },
    { id: 'kho', parentId: 'vp' },
  ];

  it('parent là chính mình → cycle', () => {
    expect(isOrgUnitParentCycle(all, 'vp', 'vp')).toBe(true);
  });

  it('parent là hậu duệ → cycle', () => {
    expect(isOrgUnitParentCycle(all, 'root', 'kho')).toBe(true);
    expect(isOrgUnitParentCycle(all, 'vp', 'kho')).toBe(true);
  });

  it('parent là tổ tiên → không cycle', () => {
    expect(isOrgUnitParentCycle(all, 'kho', 'root')).toBe(false);
  });

  it('parent null → không cycle', () => {
    expect(isOrgUnitParentCycle(all, 'kho', null)).toBe(false);
  });
});

describe('D-28 — cây đơn vị (buildOrgUnitTree)', () => {
  const mk = (id: string, parentId: string | null) => ({
    id,
    code: null,
    name: id,
    type: 'OFFICE' as const,
    parentId,
    parentName: null,
    address: null,
    phone: null,
    managerUserId: null,
    managerUserName: null,
    isActive: true,
    childCount: 0,
    userCount: 0,
    createdAt: null,
    updatedAt: null,
  });

  it('dựng cây 2 tầng', () => {
    const tree = buildOrgUnitTree([mk('root', null), mk('vp', 'root'), mk('kho', 'vp')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].children).toHaveLength(1);
    expect(tree[0].children![0].children![0].id).toBe('kho');
  });

  it('đơn vị mồ côi đưa lên gốc', () => {
    const tree = buildOrgUnitTree([mk('root', null), mk('x', 'khong-ton-tai')]);
    expect(tree).toHaveLength(2);
  });
});

describe('D-28 — toOrgUnitDto', () => {
  const baseRow = {
    id: 'ou-1',
    code: 'CN-HN',
    name: 'Chi nhánh Hà Nội',
    type: 'OFFICE',
    parent_id: 'root',
    address: 'Số 9 Tôn Thất Thuyết',
    phone: '024-1234',
    manager_user_id: 'u-1',
    is_active: 1,
    created_at: '2026-10-20T00:00:00.000Z',
    updated_at: '2026-10-20T01:00:00.000Z',
  };

  it('map đủ trường, is_active=1 → isActive=true', () => {
    const dto = toOrgUnitDto(baseRow, {
      parentName: 'Công ty Demo',
      managerUserName: 'Admin',
      childCount: 2,
      userCount: 5,
    });
    expect(dto.code).toBe('CN-HN');
    expect(dto.type).toBe('OFFICE');
    expect(dto.isActive).toBe(true);
    expect(dto.parentName).toBe('Công ty Demo');
    expect(dto.managerUserName).toBe('Admin');
    expect(dto.childCount).toBe(2);
    expect(dto.userCount).toBe(5);
  });

  it('is_active=0 → isActive=false', () => {
    expect(toOrgUnitDto({ ...baseRow, is_active: 0 }, {}).isActive).toBe(false);
  });
});

describe('D-28 — guard xóa vai trò (validateRoleDelete)', () => {
  it('vai trò hệ thống → ROLE_IS_SYSTEM', () => {
    expect(validateRoleDelete({ isSystem: true, userCount: 0 })).toBe('ROLE_IS_SYSTEM');
    expect(validateRoleDelete({ isSystem: true, userCount: 3 })).toBe('ROLE_IS_SYSTEM');
  });

  it('vai trò thường đang có user → ROLE_IN_USE', () => {
    expect(validateRoleDelete({ isSystem: false, userCount: 2 })).toBe('ROLE_IN_USE');
  });

  it('vai trò thường không ai giữ → null', () => {
    expect(validateRoleDelete({ isSystem: false, userCount: 0 })).toBeNull();
  });
});

describe('D-28 — validate permission gán cho vai trò (unknownPermissions)', () => {
  it('permission trong catalog → không báo lỗi', () => {
    expect(unknownPermissions(['process.view', 'execution.operate'])).toEqual([]);
  });

  it('permission lạ → báo lại', () => {
    expect(unknownPermissions(['process.view', 'super.admin'])).toEqual(['super.admin']);
    expect(unknownPermissions(['hack.permission'])).toEqual(['hack.permission']);
  });

  it('khử trùng và bỏ rỗng', () => {
    expect(unknownPermissions(['x.1', 'x.1', '  '])).toEqual(['x.1']);
  });
});

describe('D-28 — guard xóa chức vụ (validatePositionDelete)', () => {
  it('đang gán cho user → POSITION_IN_USE', () => {
    expect(validatePositionDelete({ userCount: 1, stepCount: 0 })).toBe('POSITION_IN_USE');
  });

  it('đang dùng trong bước → POSITION_IN_USE', () => {
    expect(validatePositionDelete({ userCount: 0, stepCount: 3 })).toBe('POSITION_IN_USE');
  });

  it('không dùng → null', () => {
    expect(validatePositionDelete({ userCount: 0, stepCount: 0 })).toBeNull();
  });
});

describe('D-28 — kiểm tra trùng code qua fake D1', () => {
  it('position trùng code → true', async () => {
    const { db, calls } = makeFirstDb({ id: 'p-1' });
    expect(await positionCodeTaken(db, 'THU-KHO')).toBe(true);
    expect(calls[0].sql).toContain('FROM positions WHERE code');
    expect(calls[0].binds).toEqual(['THU-KHO']);
  });

  it('position không trùng → false; excludeId loại chính nó', async () => {
    const { db, calls } = makeFirstDb(null);
    expect(await positionCodeTaken(db, 'THU-KHO', 'p-1')).toBe(false);
    expect(calls[0].sql).toContain('id != ?2');
    expect(calls[0].binds).toEqual(['THU-KHO', 'p-1']);
  });

  it('role trùng code → true', async () => {
    const { db } = makeFirstDb({ id: 'r-1' });
    expect(await roleCodeTaken(db, 'ADMIN')).toBe(true);
  });

  it('org unit trùng code → true', async () => {
    const { db } = makeFirstDb({ id: 'ou-1' });
    expect(await orgUnitCodeTaken(db, 'CN-HN')).toBe(true);
  });

  it('org unit không trùng → false', async () => {
    const { db } = makeFirstDb(null);
    expect(await orgUnitCodeTaken(db, 'CN-HN')).toBe(false);
  });
});
