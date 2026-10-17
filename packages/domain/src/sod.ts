import { APPROVER_ROLES, type SystemRole } from './roles.js';

/**
 * Separation-of-duties policy (OPEN-SOD-01, đã chốt 17/10/2026).
 *
 * - Vai trò được phê duyệt: approver (role riêng), admin, manager.
 * - Mặc định 4 mắt: người yêu cầu không được tự chọn mình làm người phê duyệt.
 * - Ngoại lệ: admin/manager được tự phê duyệt khi cần thiết, nhưng BẮT BUỘC
 *   lưu vết audit và hệ thống gắn cờ.
 */
export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKING';

/** Cấp tối thiểu được phê duyệt theo mức nghiêm trọng (đề xuất đã duyệt). */
export const SEVERITY_APPROVER_LEVEL: Record<ExceptionSeverity, ReadonlySet<SystemRole>> = {
  LOW: APPROVER_ROLES,
  MEDIUM: APPROVER_ROLES,
  HIGH: new Set(['manager', 'admin']),
  BLOCKING: new Set(['manager', 'admin']),
};

/** Người này có thuộc nhóm được phê duyệt không? */
export function canApprove(roles: readonly SystemRole[]): boolean {
  return roles.some((r) => APPROVER_ROLES.has(r));
}

/** Người này có đạt cấp phê duyệt cho mức nghiêm trọng không? */
export function canApproveSeverity(
  roles: readonly SystemRole[],
  severity: ExceptionSeverity,
): boolean {
  const allowed = SEVERITY_APPROVER_LEVEL[severity];
  return roles.some((r) => allowed.has(r));
}

/**
 * Chọn người phê duyệt cho một yêu cầu.
 * @returns null nếu không hợp lệ (kèm lý do).
 */
export function selectApprover(
  requesterId: string,
  candidateId: string,
  candidateRoles: readonly SystemRole[],
  severity: ExceptionSeverity,
): { ok: true } | { ok: false; reason: string } {
  if (candidateId === requesterId) {
    return { ok: false, reason: 'SELF_APPROVAL_NOT_ALLOWED' };
  }
  if (!canApproveSeverity(candidateRoles, severity)) {
    return { ok: false, reason: 'INSUFFICIENT_APPROVER_LEVEL' };
  }
  return { ok: true };
}

export interface SelfApprovalCheck {
  allowed: boolean;
  /** true khi tự phê duyệt cần gắn cờ đỏ trong audit. */
  flagged: boolean;
  reasonRequired: boolean;
}

/**
 * Tự phê duyệt: chỉ admin/manager được phép, luôn lưu vết và gắn cờ.
 * Role approver thuần túy KHÔNG được tự phê duyệt.
 */
export function checkSelfApproval(
  roles: readonly SystemRole[],
  severity: ExceptionSeverity,
): SelfApprovalCheck {
  const privileged = roles.includes('admin') || roles.includes('manager');
  if (!privileged) {
    return { allowed: false, flagged: false, reasonRequired: false };
  }
  return {
    allowed: true,
    flagged: true,
    reasonRequired: severity === 'HIGH' || severity === 'BLOCKING',
  };
}
