import { describe, expect, it } from 'vitest';
import { hashPassword, newSessionToken, sha256Hex, verifyPassword } from './auth.js';
import { effectivePermissions, hasPermission } from './permissions.js';
import { APPROVER_ROLES, isApproverRole } from './roles.js';
import { hasScope } from './scope.js';
import { canApprove, canApproveSeverity, checkSelfApproval, selectApprover } from './sod.js';

describe('roles', () => {
  it('approver pool gồm approver, admin, manager', () => {
    expect(APPROVER_ROLES.has('approver')).toBe(true);
    expect(APPROVER_ROLES.has('admin')).toBe(true);
    expect(APPROVER_ROLES.has('manager')).toBe(true);
    expect(isApproverRole('viewer')).toBe(false);
  });
});

describe('permissions', () => {
  it('admin có mọi permission', () => {
    expect(hasPermission(['admin'], 'user.manage')).toBe(true);
    expect(hasPermission(['admin'], 'process.approve')).toBe(true);
  });

  it('tổng quyền = hợp các role', () => {
    const perms = effectivePermissions(['author', 'viewer']);
    expect(perms.has('process.create')).toBe(true);
    expect(perms.has('report.view')).toBe(true);
    expect(hasPermission(['viewer'], 'process.create')).toBe(false);
  });
});

describe('SOD (OPEN-SOD-01)', () => {
  it('không được tự chọn mình làm người phê duyệt', () => {
    const r = selectApprover('u1', 'u1', ['manager'], 'HIGH');
    expect(r.ok).toBe(false);
  });

  it('quản lý A gửi quản lý B được phép', () => {
    const r = selectApprover('u1', 'u2', ['manager'], 'HIGH');
    expect(r.ok).toBe(true);
  });

  it('người không thuộc nhóm phê duyệt bị từ chối', () => {
    const r = selectApprover('u1', 'u2', ['viewer'], 'LOW');
    expect(r.ok).toBe(false);
  });

  it('HIGH cần cấp quản lý trở lên', () => {
    expect(canApproveSeverity(['approver'], 'HIGH')).toBe(false);
    expect(canApproveSeverity(['manager'], 'HIGH')).toBe(true);
  });

  it('admin/manager được tự duyệt nhưng bị gắn cờ + lưu vết', () => {
    const c = checkSelfApproval(['manager'], 'BLOCKING');
    expect(c.allowed).toBe(true);
    expect(c.flagged).toBe(true);
    expect(c.reasonRequired).toBe(true);
  });

  it('role approver thuần không được tự duyệt', () => {
    const c = checkSelfApproval(['approver'], 'LOW');
    expect(c.allowed).toBe(false);
  });

  it('canApprove đúng với 3 role', () => {
    expect(canApprove(['admin'])).toBe(true);
    expect(canApprove(['author'])).toBe(false);
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
