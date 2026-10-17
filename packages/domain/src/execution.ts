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
