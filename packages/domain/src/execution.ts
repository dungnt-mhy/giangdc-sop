/** Execution lifecycle states (SRS v1.6 §7.5, Table 5). */
export type ExecutionState =
  | 'CREATED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED';

/**
 * Allowed Execution transitions (CONTRACT).
 * COMPLETED -> IN_PROGRESS is the reopen path, only when the feature/policy allows it.
 */
const TRANSITIONS: Record<ExecutionState, ReadonlySet<ExecutionState>> = {
  CREATED: new Set(['IN_PROGRESS', 'CANCELLED']),
  IN_PROGRESS: new Set(['PAUSED', 'BLOCKED', 'COMPLETED', 'CANCELLED']),
  PAUSED: new Set(['IN_PROGRESS', 'CANCELLED']),
  BLOCKED: new Set(['IN_PROGRESS', 'CANCELLED']),
  COMPLETED: new Set(['IN_PROGRESS']),
  CANCELLED: new Set(),
};

export function canTransition(from: ExecutionState, to: ExecutionState): boolean {
  return TRANSITIONS[from]?.has(to) ?? false;
}

/* ---------- Vòng đời bước của lượt (T3, D-12) ---------- */

export type ExecutionStepState = 'PENDING' | 'IN_PROGRESS' | 'DONE';

const STEP_TRANSITIONS: Record<ExecutionStepState, ReadonlySet<ExecutionStepState>> = {
  PENDING: new Set(['IN_PROGRESS']),
  IN_PROGRESS: new Set(['DONE']),
  DONE: new Set(),
};

export function canStepTransition(from: ExecutionStepState, to: ExecutionStepState): boolean {
  return STEP_TRANSITIONS[from]?.has(to) ?? false;
}

/** Bước đã hoàn thành khi mọi bước BẮT BUỘC đều DONE (bước tùy chọn có thể bỏ trống). */
export function allRequiredStepsDone(
  steps: ReadonlyArray<{ required: boolean; state: ExecutionStepState }>,
): boolean {
  return steps.filter((s) => s.required).every((s) => s.state === 'DONE');
}

/**
 * Bước có yêu cầu bằng chứng loại PHOTO bắt buộc không (PRC-006, D-12).
 * completion là snapshot tại lúc tạo lượt.
 */
export function photoRequired(
  completion: ReadonlyArray<{ kind: string; required: boolean }>,
): boolean {
  return completion.some((c) => c.kind === 'PHOTO' && c.required);
}

/**
 * Kiểm tra gán người cho bước (D-09/D-12): nếu bước định nghĩa chức vụ
 * ("Vai trò thực hiện"/"Vai trò giám sát") thì user phải giữ ít nhất 1 chức vụ khớp;
 * bước không định nghĩa chức vụ thì user đang hoạt động nào cũng được gán.
 */
export function assigneeMatchesPositions(
  stepPositionIds: readonly string[],
  userPositionIds: readonly string[],
): boolean {
  if (stepPositionIds.length === 0) return true;
  const held = new Set(userPositionIds);
  return stepPositionIds.some((id) => held.has(id));
}

/** Sinh mã lượt duy nhất: TH-YYYYMMDD-XXXX (4 ký tự ngẫu nhiên, chữ hoa + số). */
export function generateExecutionCode(now: Date = new Date()): string {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  return `TH-${ymd}-${suffix}`;
}

/* ---------- D-14: chuẩn hóa form tạo lượt đơn giản ---------- */

export type ExecutionShift = 'SANG' | 'CHIEU' | 'TOI';

const EXECUTION_SHIFTS: ReadonlySet<string> = new Set(['SANG', 'CHIEU', 'TOI']);

export function isValidShift(v: string | null | undefined): v is ExecutionShift {
  return typeof v === 'string' && EXECUTION_SHIFTS.has(v);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ExecutionCreateInput {
  title?: string | null;
  executionDate?: string | null;
  executionTime?: string | null;
  shift?: string | null;
  createdBy?: string | null;
  mainPerformerId?: string | null;
  supervisorId?: string | null;
}

export interface NormalizedExecutionCreate {
  title: string;
  /** YYYY-MM-DD. */
  executionDate: string;
  /** HH:MM. */
  executionTime: string | null;
  shift: ExecutionShift | null;
  /** id user chịu trách nhiệm tạo lượt. */
  createdBy: string;
  mainPerformerId: string | null;
  supervisorId: string | null;
}

export interface NormalizeError {
  ok: false;
  code: 'TITLE_REQUIRED' | 'INVALID_EXECUTION_DATE' | 'INVALID_EXECUTION_TIME' | 'INVALID_SHIFT';
  message: string;
}

/**
 * Chuẩn hóa body tạo lượt (D-14): ngày thực hiện mặc định = hôm nay (server),
 * người tạo mặc định = người gọi API; validate định dạng ngày/giờ/ca.
 * `todayYmd` do caller truyền vào (YYYY-MM-DD) để test được.
 */
export function normalizeExecutionCreate(
  body: ExecutionCreateInput,
  sessionUserId: string,
  todayYmd: string,
):
  | { ok: true; value: NormalizedExecutionCreate }
  | NormalizeError {
  const trimOrNull = (v: string | null | undefined): string | null => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
  };
  const title = trimOrNull(body.title);
  if (title === null) {
    return {
      ok: false,
      code: 'TITLE_REQUIRED',
      message: 'Tiêu đề lượt là bắt buộc.',
    };
  }
  const executionDate = trimOrNull(body.executionDate) ?? todayYmd;
  if (!DATE_RE.test(executionDate)) {
    return {
      ok: false,
      code: 'INVALID_EXECUTION_DATE',
      message: 'Ngày thực hiện phải đúng định dạng YYYY-MM-DD.',
    };
  }
  const executionTime = trimOrNull(body.executionTime);
  if (executionTime !== null && !TIME_RE.test(executionTime)) {
    return {
      ok: false,
      code: 'INVALID_EXECUTION_TIME',
      message: 'Giờ thực hiện phải đúng định dạng HH:MM (24h).',
    };
  }
  const shiftRaw = trimOrNull(body.shift)?.toUpperCase() ?? null;
  if (shiftRaw !== null && !isValidShift(shiftRaw)) {
    return {
      ok: false,
      code: 'INVALID_SHIFT',
      message: 'Ca làm việc chỉ nhận SANG, CHIEU hoặc TOI.',
    };
  }
  return {
    ok: true,
    value: {
      title,
      executionDate,
      executionTime,
      shift: shiftRaw,
      createdBy: trimOrNull(body.createdBy) ?? sessionUserId,
      mainPerformerId: trimOrNull(body.mainPerformerId),
      supervisorId: trimOrNull(body.supervisorId),
    },
  };
}

export interface StepAssigneeCheck {
  performerOk: boolean;
  supervisorOk: boolean;
}

/**
 * Kiểm tra người được phân công bước (D-14, dùng cho cả tạo lượt và POST assign):
 * performer phải khớp "Vai trò thực hiện", supervisor (nếu có) phải khớp
 * "Vai trò giám sát"; bước không định nghĩa chức vụ thì ai cũng được.
 */
export function checkStepAssignees(
  needPerformerPositionIds: readonly string[],
  needSupervisorPositionIds: readonly string[],
  performerPositionIds: readonly string[],
  supervisorPositionIds: readonly string[] | null,
): StepAssigneeCheck {
  return {
    performerOk: assigneeMatchesPositions(needPerformerPositionIds, performerPositionIds),
    supervisorOk:
      supervisorPositionIds === null
        ? true
        : assigneeMatchesPositions(needSupervisorPositionIds, supervisorPositionIds),
  };
}
