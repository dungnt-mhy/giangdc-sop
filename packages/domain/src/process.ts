import {
  checkSelfApproval,
  selectApprover,
  type ExceptionSeverity,
  type SelfApprovalCheck,
} from './sod.js';
import type { Permission } from './permissions.js';

/**
 * Process Catalog + Authoring & Governance — domain (T2).
 * SRS v1.6 §7.1 (vòng đời phiên bản), §7.5 (INVARIANT/CONTRACT),
 * PRC-001..009, GOV-001..007, BR-001/002/003/004, D-08.
 */

/** Trạng thái phiên bản quy trình (SRS §7.1).
 * D-20b: "Đã hủy" KHÔNG phải state — là flag voided_at/void_reason (migration 0012),
 * vì D1 qua REST không rebuild được bảng có FK để thêm giá trị vào CHECK. */
export type ProcessVersionState =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'RETIRED';

/**
 * Transition hợp lệ (CONTRACT — theo sơ đồ §7.1):
 * DRAFT -> IN_REVIEW -> APPROVED -> ACTIVE -> SUPERSEDED -> RETIRED,
 * APPROVED -> SCHEDULED -> ACTIVE, IN_REVIEW -> DRAFT (trả sửa, GOV-003).
 * D-20 mở rộng:
 * - APPROVED -> DRAFT ("Hủy phê duyệt");
 * - ACTIVE -> RETIRED ("Ngừng");
 * - SUPERSEDED/RETIRED -> IN_REVIEW ("Kích hoạt lại", phải qua duyệt lại).
 * D-20b: "Hủy bỏ" không đổi state — set cờ voided_at (version đóng băng mọi transition).
 */
const VERSION_TRANSITIONS: Record<ProcessVersionState, ReadonlySet<ProcessVersionState>> = {
  DRAFT: new Set(['IN_REVIEW']),
  IN_REVIEW: new Set(['DRAFT', 'APPROVED']),
  APPROVED: new Set(['ACTIVE', 'SCHEDULED', 'DRAFT']),
  SCHEDULED: new Set(['ACTIVE']),
  ACTIVE: new Set(['SUPERSEDED', 'RETIRED']),
  SUPERSEDED: new Set(['RETIRED', 'IN_REVIEW']),
  RETIRED: new Set(['IN_REVIEW']),
};

export function canVersionTransition(from: ProcessVersionState, to: ProcessVersionState): boolean {
  return VERSION_TRANSITIONS[from]?.has(to) ?? false;
}

/**
 * D-20b: version đã hủy <=> voided_at IS NOT NULL.
 * Version đã hủy đóng băng mọi transition (API trả 409 VERSION_VOIDED).
 */
export function isVoided(version: { voidedAt?: string | null } | null | undefined): boolean {
  return !!version?.voidedAt;
}

/** GOV-001: từ IN_REVIEW trở đi khóa sửa nội dung; chỉ DRAFT được sửa. */
export function isEditableState(state: ProcessVersionState): boolean {
  return state === 'DRAFT';
}

/** BR-001: số phiên bản tiếp theo (duy nhất trong một quy trình). */
export function nextVersionNo(existing: readonly number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

export type ChangeSize = 'MINOR' | 'MAJOR';

/** Yêu cầu hoàn thành của bước (PRC-006). */
export type CompletionKind = 'FIELD' | 'FORM' | 'PHOTO' | 'FILE' | 'CONFIRM' | 'SCAN' | 'NOTE';

export interface CompletionRequirement {
  kind: CompletionKind;
  label: string;
  required: boolean;
}

/** Chính sách bỏ qua bước (PRC-007). */
export interface SkipPolicy {
  allowed: boolean;
  /** Chức vụ được phép bỏ qua — id trong bảng positions (D-09/D-10). */
  allowedPositions: string[];
  reasonRequired: boolean;
  approvalLevel: ExceptionSeverity | null;
}

/** Hướng xử lý khi bước không đạt (PRC-008 — không phải graph tùy ý). */
export type FailurePolicy = 'STOP' | 'RETRY' | 'ESCALATE' | 'CANCEL';

/** Bước quy trình — đủ 12 trường theo PRC-005. */
export interface ProcessStepFields {
  code: string;
  title: string;
  prerequisites: string | null;
  inputs: string | null;
  instructions: string | null;
  expectedResult: string | null;
  outputs: string | null;
  notes: string | null;
  /** Id chức vụ thực hiện bước — nhiều chọn, tham chiếu bảng positions (D-09). */
  performerPositionIds: string[];
  /** Id chức vụ giám sát bước — nhiều chọn (D-09). */
  supervisorPositionIds: string[];
  required: boolean;
  targetDurationMin: number | null;
  warnings: string | null;
  completion: CompletionRequirement[];
  skip: SkipPolicy;
  failurePolicy: FailurePolicy;
}

/** Bản nháp phiên bản dùng cho validate (PRC-009, BR-003). */
export interface VersionDraft {
  changeSummary: string;
  changeSize: ChangeSize;
  impactAssessment: string | null;
  effectiveFrom: string | null;
}

export type StepDraft = ProcessStepFields;

/** Bước trống với đủ 12 trường PRC-005 + cấu hình mặc định. */
export function blankStep(): StepDraft {
  return {
    code: '',
    title: '',
    prerequisites: null,
    inputs: null,
    instructions: null,
    expectedResult: null,
    outputs: null,
    notes: null,
    performerPositionIds: [],
    supervisorPositionIds: [],
    required: true,
    targetDurationMin: null,
    warnings: null,
    completion: [],
    skip: { allowed: false, allowedPositions: [], reasonRequired: true, approvalLevel: null },
    failurePolicy: 'STOP',
  };
}

export interface ValidationIssue {
  /** null = lỗi ở cấp phiên bản; có giá trị = lỗi của bước (theo bước/trường, PRC-009). */
  stepCode: string | null;
  field: string;
  code: string;
  message: string;
}

/**
 * Kiểm tra bản nháp trước khi gửi duyệt (PRC-009 + BR-003).
 * Trả danh sách lỗi theo bước/trường; rỗng = hợp lệ.
 */
export function validateVersionForSubmit(
  version: VersionDraft,
  steps: readonly StepDraft[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // BR-003: change_summary bắt buộc.
  if (!version.changeSummary || !version.changeSummary.trim()) {
    issues.push({
      stepCode: null,
      field: 'changeSummary',
      code: 'CHANGE_SUMMARY_REQUIRED',
      message: 'Nội dung thay đổi phải có change_summary (BR-003).',
    });
  }
  // BR-003: thay đổi lớn cần đánh giá tác động.
  if (version.changeSize === 'MAJOR' && !version.impactAssessment?.trim()) {
    issues.push({
      stepCode: null,
      field: 'impactAssessment',
      code: 'IMPACT_ASSESSMENT_REQUIRED',
      message: 'Thay đổi lớn cần đánh giá tác động (BR-003).',
    });
  }

  if (steps.length === 0) {
    issues.push({
      stepCode: null,
      field: 'steps',
      code: 'VERSION_EMPTY',
      message: 'Bản nháp phải có ít nhất một bước.',
    });
    return issues;
  }

  const seenCodes = new Set<string>();
  for (const s of steps) {
    const tag = s.code?.trim() || '(chưa có mã)';
    if (!s.code?.trim()) {
      issues.push({ stepCode: null, field: 'code', code: 'STEP_CODE_REQUIRED', message: `Bước ${tag}: thiếu mã bước.` });
    } else if (seenCodes.has(s.code.trim())) {
      issues.push({ stepCode: s.code, field: 'code', code: 'STEP_CODE_DUPLICATE', message: `Mã bước "${s.code}" bị trùng.` });
    } else {
      seenCodes.add(s.code.trim());
    }
    if (!s.title?.trim()) {
      issues.push({ stepCode: s.code || null, field: 'title', code: 'STEP_TITLE_REQUIRED', message: `Bước ${tag}: thiếu tiêu đề hành động.` });
    }
    // Chức vụ thực hiện / giám sát (D-09): mảng id đã trim, non-empty, tối đa 20.
    for (const [field, arr] of [['performerPositionIds', s.performerPositionIds ?? []], ['supervisorPositionIds', s.supervisorPositionIds ?? []]] as const) {
      if (!Array.isArray(arr)) {
        issues.push({ stepCode: s.code || null, field, code: 'POSITION_IDS_NOT_ARRAY', message: `Bước ${tag}: ${field} phải là mảng.` });
        continue;
      }
      if (arr.length > 20) {
        issues.push({ stepCode: s.code || null, field, code: 'POSITION_IDS_TOO_MANY', message: `Bước ${tag}: ${field} tối đa 20 chức vụ.` });
      }
      if (arr.some((r) => typeof r !== 'string' || !r.trim())) {
        issues.push({ stepCode: s.code || null, field, code: 'POSITION_ID_EMPTY', message: `Bước ${tag}: ${field} chứa id chức vụ rỗng.` });
      }
    }
    // PRC-007: cho phép bỏ qua phải khai báo chức vụ được bỏ qua.
    if (s.skip.allowed && s.skip.allowedPositions.length === 0) {
      issues.push({
        stepCode: s.code || null,
        field: 'skip.allowedPositions',
        code: 'SKIP_POSITIONS_REQUIRED',
        message: `Bước ${tag}: cho phép bỏ qua thì phải khai báo chức vụ được bỏ qua (PRC-007).`,
      });
    }
    for (const req of s.completion) {
      if (!req.label?.trim()) {
        issues.push({
          stepCode: s.code || null,
          field: 'completion',
          code: 'COMPLETION_LABEL_REQUIRED',
          message: `Bước ${tag}: yêu cầu hoàn thành thiếu nhãn.`,
        });
      }
    }
  }
  return issues;
}

export interface VersionApprovalInput {
  requesterId: string;
  candidateId: string;
  /** D-10: quyền hiệu lực + cờ senior của người phê duyệt (nạp từ DB). */
  candidatePermissions: ReadonlySet<Permission>;
  candidateSenior: boolean;
  /** D-08: ánh xạ severity -> cấp phê duyệt áp dụng cho cả phê duyệt phiên bản. */
  severity: ExceptionSeverity;
}

export type VersionApprovalResult =
  | { ok: true; selfApproved: boolean; flagged: boolean; reasonRequired: boolean }
  | { ok: false; reason: string };

/**
 * Kiểm tra người phê duyệt phiên bản (GOV-004 + D-10 + D-08).
 * - 4 mắt mặc định: không tự duyệt (trừ vai trò senior tự duyệt có lưu vết + gắn cờ).
 * - Mức severity càng cao, cấp phê duyệt càng cao (LOW/MEDIUM: có process.approve;
 *   HIGH/BLOCKING: thêm cờ senior).
 */
export function checkVersionApproval(input: VersionApprovalInput): VersionApprovalResult {
  const { requesterId, candidateId, candidatePermissions, candidateSenior, severity } = input;
  if (candidateId === requesterId) {
    // Tự phê duyệt: chỉ vai trò senior, luôn gắn cờ (D-10).
    const self: SelfApprovalCheck = checkSelfApproval(candidateSenior, severity);
    if (!self.allowed) return { ok: false, reason: 'SELF_APPROVAL_NOT_ALLOWED' };
    return { ok: true, selfApproved: true, flagged: self.flagged, reasonRequired: self.reasonRequired };
  }
  const r = selectApprover(
    requesterId,
    { userId: candidateId, permissions: candidatePermissions, seniorApprover: candidateSenior },
    severity,
  );
  if (!r.ok) return r;
  return { ok: true, selfApproved: false, flagged: false, reasonRequired: severity === 'HIGH' || severity === 'BLOCKING' };
}

export interface ActivationPlan {
  ok: boolean;
  /** Id phiên bản ACTIVE cũ cần chuyển SUPERSEDED trong cùng transaction. */
  supersede: string[];
  /** true khi bản cần kích hoạt đã ACTIVE (retry idempotent — AC-02). */
  alreadyActive: boolean;
  reason?: string;
}

/**
 * Lập kế hoạch kích hoạt (domain-level, SRS §7.1 + AC-02):
 * - Tối đa 1 ACTIVE/process; kích hoạt bản mới supersede bản cũ nguyên tử.
 * - Tối đa 1 SCHEDULED chưa kích hoạt; đã có SCHEDULED thì từ chối schedule thêm.
 * - Retry activation idempotent: không tạo thêm ACTIVE/event.
 */
export function resolveActivation(
  versions: ReadonlyArray<{ id: string; state: ProcessVersionState }>,
  targetId: string,
): ActivationPlan {
  const target = versions.find((v) => v.id === targetId);
  if (!target) return { ok: false, supersede: [], alreadyActive: false, reason: 'VERSION_NOT_FOUND' };
  if (target.state === 'ACTIVE') {
    return { ok: true, supersede: [], alreadyActive: true };
  }
  if (target.state !== 'APPROVED' && target.state !== 'SCHEDULED') {
    return { ok: false, supersede: [], alreadyActive: false, reason: 'NOT_RELEASABLE_STATE' };
  }
  const scheduled = versions.filter((v) => v.state === 'SCHEDULED' && v.id !== targetId);
  if (scheduled.length > 0) {
    return { ok: false, supersede: [], alreadyActive: false, reason: 'ANOTHER_SCHEDULED_EXISTS' };
  }
  const active = versions.filter((v) => v.state === 'ACTIVE');
  return { ok: true, supersede: active.map((v) => v.id), alreadyActive: false };
}
