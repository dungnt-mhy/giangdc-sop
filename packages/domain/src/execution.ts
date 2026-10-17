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
