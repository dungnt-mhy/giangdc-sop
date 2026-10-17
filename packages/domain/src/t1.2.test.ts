import { describe, expect, it } from 'vitest';
import { hashPassword, newSessionToken, sha256Hex, verifyPassword } from './auth.js';
import { effectivePermissions, hasPermission, type Permission } from './permissions.js';
import type { RoleWithPermissions } from './roles.js';
import { hasScope } from './scope.js';
import {
  canApprove,
  canApproveSeverity,
  checkSelfApproval,
  selectApprover,
  type ApproverIdentity,
} from './sod.js';

/** Vai trò mẫu nạp từ DB (D-10): quyền + cờ senior thay 7 role cứng. */
function role(
  code: string,
  permissions: Permission[],
  seniorApprover = false,
): RoleWithPermissions {
  return { id: `r-${code}`, code, name: code, seniorApprover, permissions };
}

const ADMIN = role('ADMIN', [
  'process.create',
  'process.approve',
  'process.publish',
  'user.manage',
] as Permission[], true);
const APPROVER = role('NGUOI_PHE_DUYET', ['process.view', 'process.approve'] as Permission[]);
const STAFF = role('NGUOI_THUC_HIEN', ['process.view', 'step.execute'] as Permission[]);

function ident(userId: string, r: RoleWithPermissions): ApproverIdentity {
  return {
    userId,
    permissions: new Set(r.permissions),
    seniorApprover: r.seniorApprover,
  };
}

describe('roles (D-10)', () => {
  it('vai trò mang cờ seniorApprover thay cho admin/manager cứng', () => {
    expect(ADMIN.seniorApprover).toBe(true);
    expect(APPROVER.seniorApprover).toBe(false);
  });
});

describe('permissions (D-10: nạp từ DB)', () => {
  it('tổng quyền = hợp các permission của mọi vai trò đang giữ', () => {
    const perms = effectivePermissions([ADMIN.permissions, STAFF.permissions]);
    expect(perms.has('user.manage')).toBe(true);
    expect(perms.has('step.execute')).toBe(true);
    expect(hasPermission(perms, 'process.approve')).toBe(true);
    expect(hasPermission(new Set(STAFF.permissions), 'process.approve')).toBe(false);
  });

  it('không còn map cứng role -> permission trong code', () => {
    const perms = effectivePermissions([]);
    expect(perms.size).toBe(0);
  });
});

describe('SOD (D-10)', () => {
  it('không được tự chọn mình làm người phê duyệt', () => {
    const r = selectApprover('u1', ident('u1', APPROVER), 'LOW');
    expect(r.ok).toBe(false);
  });

  it('người có process.approve được duyệt cho người khác', () => {
    const r = selectApprover('u1', ident('u2', APPROVER), 'MEDIUM');
    expect(r.ok).toBe(true);
  });

  it('người không có process.approve bị từ chối', () => {
    const r = selectApprover('u1', ident('u2', STAFF), 'LOW');
    expect(r.ok).toBe(false);
  });

  it('HIGH/BLOCKING đòi cờ senior', () => {
    expect(canApproveSeverity(new Set(APPROVER.permissions), false, 'HIGH')).toBe(false);
    expect(canApproveSeverity(new Set(ADMIN.permissions), true, 'HIGH')).toBe(true);
    expect(canApproveSeverity(new Set(ADMIN.permissions), true, 'BLOCKING')).toBe(true);
  });

  it('vai trò senior được tự duyệt nhưng bị gắn cờ + lưu vết', () => {
    const c = checkSelfApproval(true, 'BLOCKING');
    expect(c.allowed).toBe(true);
    expect(c.flagged).toBe(true);
    expect(c.reasonRequired).toBe(true);
  });

  it('vai trò không senior không được tự duyệt', () => {
    const c = checkSelfApproval(false, 'LOW');
    expect(c.allowed).toBe(false);
  });

  it('canApprove theo quyền process.approve', () => {
    expect(canApprove(new Set(ADMIN.permissions))).toBe(true);
    expect(canApprove(new Set(STAFF.permissions))).toBe(false);
  });
});

describe('scope (OPEN-SCOPE-01)', () => {
  it('chỉ thấy đúng đơn vị được gán', () => {
    const scopes = [{ userId: 'u1', orgUnitId: 'kho-hn' }];
    expect(hasScope(scopes, 'kho-hn')).toBe(true);
    expect(hasScope(scopes, 'vp-hcm')).toBe(false);
  });
});

describe('auth', () => {
  it('hash và verify mật khẩu', async () => {
    const h = await hashPassword('Demo@123');
    expect(await verifyPassword('Demo@123', h)).toBe(true);
    expect(await verifyPassword('sai', h)).toBe(false);
  });

  it('session token duy nhất và hash ổn định', async () => {
    const t1 = newSessionToken();
    const t2 = newSessionToken();
    expect(t1).not.toBe(t2);
    expect(await sha256Hex(t1)).toBe(await sha256Hex(t1));
  });
});
