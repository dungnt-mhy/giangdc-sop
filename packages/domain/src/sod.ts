import type { Permission } from './permissions.js';

/**
 * Separation-of-duties policy (D-10, thay thế phần vai trò của OPEN-SOD-01).
 *
 * - Người phê duyệt = user (khác người yêu cầu) có vai trò chứa quyền `process.approve`.
 * - Cờ `senior_approver` ở vai trò: HIGH/BLOCKING chỉ senior mới duyệt
 *   (thay manager/admin cũ).
 * - 4 mắt mặc định: người yêu cầu không được tự duyệt.
 * - Ngoại lệ: user có vai trò senior được tự phê duyệt khi cần thiết, nhưng BẮT BUỘC
 *   lưu vết audit và hệ thống gắn cờ (thay admin/manager cũ).
 */
export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKING';

/** Danh tính phê duyệt của một user: quyền hiệu lực + cờ senior (nạp từ DB). */
export interface ApproverIdentity {
  userId: string;
  permissions: ReadonlySet<Permission>;
  seniorApprover: boolean;
}

/** Có quyền phê duyệt = sở hữu `process.approve` (D-10). */
export function canApprove(permissions: ReadonlySet<Permission>): boolean {
  return permissions.has('process.approve');
}

/** Đạt cấp phê duyệt cho mức nghiêm trọng (D-10 + D-08). */
export function canApproveSeverity(
  permissions: ReadonlySet<Permission>,
  seniorApprover: boolean,
  severity: ExceptionSeverity,
): boolean {
  if (!canApprove(permissions)) return false;
  if (severity === 'HIGH' || severity === 'BLOCKING') return seniorApprover;
  return true;
}

/**
 * Chọn người phê duyệt cho một yêu cầu.
 * @returns { ok: false, reason } khi không hợp lệ.
 */
export function selectApprover(
  requesterId: string,
  candidate: ApproverIdentity,
  severity: ExceptionSeverity,
): { ok: true } | { ok: false; reason: string } {
  if (candidate.userId === requesterId) {
    return { ok: false, reason: 'SELF_APPROVAL_NOT_ALLOWED' };
  }
  if (!canApproveSeverity(candidate.permissions, candidate.seniorApprover, severity)) {
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
 * Tự phê duyệt (D-10): chỉ user có vai trò senior_approver, luôn lưu vết và gắn cờ.
 */
export function checkSelfApproval(
  seniorApprover: boolean,
  severity: ExceptionSeverity,
): SelfApprovalCheck {
  if (!seniorApprover) {
    return { allowed: false, flagged: false, reasonRequired: false };
  }
  return {
    allowed: true,
    flagged: true,
    reasonRequired: severity === 'HIGH' || severity === 'BLOCKING',
  };
}
