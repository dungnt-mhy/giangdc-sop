/**
 * DB layer cho Lượt thực hiện + Bằng chứng (T3, D-12).
 */
import type {
  EvidenceDto,
  ExecutionDto,
  ExecutionReviewAction,
  ExecutionReviewDto,
  ExecutionStepDto,
} from '@giangdc-sop/contracts';
import { normalizeSkip } from './processDb.js';

function newId(): string {
  return crypto.randomUUID();
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

interface ExecutionRow {
  id: string;
  code: string;
  process_id: string;
  process_code: string;
  process_name: string;
  version_id: string;
  version_no: number;
  state: string;
  org_unit_id: string | null;
  org_unit_name: string | null;
  note: string | null;
  title: string | null;
  execution_date: string | null;
  execution_time: string | null;
  shift: string | null;
  created_by: string;
  created_by_name: string | null;
  created_by_positions: string | null;
  main_performer_id: string | null;
  main_performer_name: string | null;
  supervisor_id: string | null;
  supervisor_name: string | null;
  approval_requested_by: string | null;
  approval_requested_by_name: string | null;
  approval_requested_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  approval_note: string | null;
  /** D-18: thời điểm bấm Bắt đầu lượt. */
  started_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ExecutionStepRow {
  id: string;
  execution_id: string;
  step_code: string;
  title: string;
  sort_order: number;
  state: string;
  required: number;
  performer_user_id: string | null;
  performer_name: string | null;
  supervisor_user_id: string | null;
  supervisor_name: string | null;
  completion_json: string | null;
  skip_json: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface EvidenceRow {
  id: string;
  execution_id: string;
  execution_step_id: string;
  kind: string;
  r2_key: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

const EXECUTION_SELECT = `
  SELECT e.id, e.code, e.process_id, e.version_id, e.state, e.org_unit_id, e.note,
         e.title, e.execution_date, e.execution_time, e.shift,
         e.main_performer_id, e.supervisor_id,
         e.created_by, e.created_at, e.updated_at,
         p.code AS process_code, p.name AS process_name,
         pv.version_no AS version_no,
         ou.name AS org_unit_name,
         u.display_name AS created_by_name,
         (SELECT GROUP_CONCAT(pos.name, ', ') FROM user_positions up JOIN positions pos ON pos.id = up.position_id WHERE up.user_id = e.created_by) AS created_by_positions,
         um.display_name AS main_performer_name,
         us.display_name AS supervisor_name,
         e.approval_requested_by, e.approval_requested_at, e.approval_note,
         e.approved_by, e.approved_at,
         arb.display_name AS approval_requested_by_name,
         ab.display_name AS approved_by_name,
         e.started_at
  FROM executions e
  JOIN processes p ON p.id = e.process_id
  JOIN process_versions pv ON pv.id = e.version_id
  LEFT JOIN org_units ou ON ou.id = e.org_unit_id
  LEFT JOIN users u ON u.id = e.created_by
  LEFT JOIN users um ON um.id = e.main_performer_id
  LEFT JOIN users us ON us.id = e.supervisor_id
  LEFT JOIN users arb ON arb.id = e.approval_requested_by
  LEFT JOIN users ab ON ab.id = e.approved_by
`;

export async function findExecution(db: D1Database, id: string): Promise<ExecutionRow | null> {
  return db
    .prepare(`${EXECUTION_SELECT} WHERE e.id = ?1`)
    .bind(id)
    .first<ExecutionRow>();
}

export async function findExecutionByCode(db: D1Database, code: string): Promise<ExecutionRow | null> {
  return db
    .prepare(`${EXECUTION_SELECT} WHERE e.code = ?1`)
    .bind(code)
    .first<ExecutionRow>();
}

export interface ListExecutionsFilter {
  orgUnitIds: string[] | null; // null = cross-scope (scope.manage), đã audit ở tầng route
  mineUserId?: string;
  state?: string;
  limit?: number;
}

export async function listExecutions(db: D1Database, f: ListExecutionsFilter): Promise<ExecutionRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (f.orgUnitIds !== null) {
    if (f.orgUnitIds.length === 0) return [];
    const ph = f.orgUnitIds.map((_, i) => `?${args.length + i + 1}`).join(',');
    conds.push(`e.org_unit_id IN (${ph})`);
    args.push(...f.orgUnitIds);
  }
  if (f.mineUserId) {
    conds.push(
      `EXISTS (SELECT 1 FROM execution_steps es WHERE es.execution_id = e.id AND es.performer_user_id = ?${args.length + 1})`,
    );
    args.push(f.mineUserId);
  }
  if (f.state) {
    conds.push(`e.state = ?${args.length + 1}`);
    args.push(f.state);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = await db
    .prepare(`${EXECUTION_SELECT} ${where} ORDER BY e.created_at DESC LIMIT ${limit}`)
    .bind(...args)
    .all<ExecutionRow>();
  return rows.results ?? [];
}

export async function getExecutionSteps(db: D1Database, executionId: string): Promise<ExecutionStepRow[]> {
  const rows = await db
    .prepare(
      `SELECT es.id, es.execution_id, es.step_code, es.title, es.sort_order, es.state, es.required,
              es.performer_user_id, es.supervisor_user_id,
              es.completion_json, es.skip_json, es.started_at, es.completed_at,
              up.display_name AS performer_name, us.display_name AS supervisor_name
       FROM execution_steps es
       LEFT JOIN users up ON up.id = es.performer_user_id
       LEFT JOIN users us ON us.id = es.supervisor_user_id
       WHERE es.execution_id = ?1 ORDER BY es.sort_order ASC`,
    )
    .bind(executionId)
    .all<ExecutionStepRow>();
  return rows.results ?? [];
}

export async function findExecutionStep(
  db: D1Database,
  executionId: string,
  stepId: string,
): Promise<ExecutionStepRow | null> {
  return db
    .prepare(
      `SELECT es.id, es.execution_id, es.step_code, es.title, es.sort_order, es.state, es.required,
              es.performer_user_id, es.supervisor_user_id,
              es.completion_json, es.skip_json, es.started_at, es.completed_at,
              up.display_name AS performer_name, us.display_name AS supervisor_name
       FROM execution_steps es
       LEFT JOIN users up ON up.id = es.performer_user_id
       LEFT JOIN users us ON us.id = es.supervisor_user_id
       WHERE es.execution_id = ?1 AND es.id = ?2`,
    )
    .bind(executionId, stepId)
    .first<ExecutionStepRow>();
}

export async function listEvidenceForSteps(
  db: D1Database,
  stepIds: string[],
): Promise<EvidenceRow[]> {
  if (stepIds.length === 0) return [];
  const ph = stepIds.map((_, i) => `?${i + 1}`).join(',');
  const rows = await db
    .prepare(
      `SELECT ev.id, ev.execution_id, ev.execution_step_id, ev.kind, ev.r2_key, ev.file_name,
              ev.mime_type, ev.size_bytes, ev.uploaded_by, ev.uploaded_at,
              u.display_name AS uploaded_by_name
       FROM evidence ev LEFT JOIN users u ON u.id = ev.uploaded_by
       WHERE ev.execution_step_id IN (${ph}) ORDER BY ev.uploaded_at ASC`,
    )
    .bind(...stepIds)
    .all<EvidenceRow>();
  return rows.results ?? [];
}

export async function findEvidence(db: D1Database, id: string): Promise<EvidenceRow | null> {
  return db
    .prepare(
      `SELECT ev.id, ev.execution_id, ev.execution_step_id, ev.kind, ev.r2_key, ev.file_name,
              ev.mime_type, ev.size_bytes, ev.uploaded_by, ev.uploaded_at,
              u.display_name AS uploaded_by_name
       FROM evidence ev LEFT JOIN users u ON u.id = ev.uploaded_by
       WHERE ev.id = ?1`,
    )
    .bind(id)
    .first<EvidenceRow>();
}

/** User đang hoạt động (để gán bước). */
export async function findActiveUser(
  db: D1Database,
  userId: string,
): Promise<{ id: string; display_name: string } | null> {
  return db
    .prepare(`SELECT id, display_name FROM users WHERE id = ?1 AND status = 'ACTIVE'`)
    .bind(userId)
    .first<{ id: string; display_name: string }>();
}

/** Danh sách user (id, tên, chức vụ) — dùng cho form gán bước (D-12). */
export async function listAssignableUsers(db: D1Database): Promise<
  { id: string; username: string; displayName: string; positionIds: string[] }[]
> {
  const users = await db
    .prepare(
      `SELECT id, username, display_name FROM users WHERE status = 'ACTIVE' ORDER BY display_name ASC`,
    )
    .bind()
    .all<{ id: string; username: string; display_name: string }>();
  const out: { id: string; username: string; displayName: string; positionIds: string[] }[] = [];
  for (const u of users.results ?? []) {
    const pos = await db
      .prepare('SELECT position_id FROM user_positions WHERE user_id = ?1')
      .bind(u.id)
      .all<{ position_id: string }>();
    out.push({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      positionIds: (pos.results ?? []).map((p) => p.position_id),
    });
  }
  return out;
}

/** id các chức vụ của user (để kiểm tra khớp khi gán bước, D-12). */
export async function getUserPositionIds(db: D1Database, userId: string): Promise<string[]> {
  const rows = await db
    .prepare('SELECT position_id FROM user_positions WHERE user_id = ?1')
    .bind(userId)
    .all<{ position_id: string }>();
  return (rows.results ?? []).map((r) => r.position_id);
}

export function toEvidenceDto(r: EvidenceRow): EvidenceDto {
  return {
    id: r.id,
    executionId: r.execution_id,
    executionStepId: r.execution_step_id,
    kind: r.kind as EvidenceDto['kind'],
    url: `/evidence/${r.id}`,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    uploadedBy: r.uploaded_by,
    uploadedByName: r.uploaded_by_name,
    uploadedAt: r.uploaded_at,
  };
}

export function toExecutionStepDto(
  r: ExecutionStepRow,
  evidence: EvidenceDto[],
  redoCount = 0,
): ExecutionStepDto {
  return {
    id: r.id,
    executionId: r.execution_id,
    stepCode: r.step_code,
    title: r.title,
    sortOrder: r.sort_order,
    state: r.state as ExecutionStepDto['state'],
    required: r.required === 1,
    performerUserId: r.performer_user_id,
    performerName: r.performer_name,
    supervisorUserId: r.supervisor_user_id,
    supervisorName: r.supervisor_name,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    completion: safeJsonParse(r.completion_json, []),
    skip: normalizeSkip(safeJsonParse(r.skip_json, null)),
    evidence,
    redoCount,
  };
}

export async function toExecutionDto(db: D1Database, row: ExecutionRow): Promise<ExecutionDto> {
  const steps = await getExecutionSteps(db, row.id);
  const evidence = await listEvidenceForSteps(
    db,
    steps.map((s) => s.id),
  );
  const byStep = new Map<string, EvidenceDto[]>();
  for (const ev of evidence) {
    const list = byStep.get(ev.execution_step_id) ?? [];
    list.push(toEvidenceDto(ev));
    byStep.set(ev.execution_step_id, list);
  }
  const reviews = await listExecutionReviews(db, row.id);
  // D-21: redoCount từng bước + rejectedStepCount từ nhật ký reject theo bước.
  const redoCountByStep = new Map<string, number>();
  for (const r of reviews) {
    if (r.action !== 'reject' || !r.stepIds) continue;
    for (const sid of r.stepIds) {
      redoCountByStep.set(sid, (redoCountByStep.get(sid) ?? 0) + 1);
    }
  }
  const latest = reviews[0];
  const rejectedStepCount =
    latest && latest.action === 'reject' && latest.stepIds ? latest.stepIds.length : 0;
  // D-21b: loại reject gần nhất để danh sách hiện badge đồng nhất (cả lượt + theo bước).
  const lastRejectKind = lastRejectKindOf(reviews);
  return {
    id: row.id,
    code: row.code,
    processId: row.process_id,
    processCode: row.process_code,
    processName: row.process_name,
    versionId: row.version_id,
    versionNo: row.version_no,
    state: row.state as ExecutionDto['state'],
    orgUnitId: row.org_unit_id,
    orgUnitName: row.org_unit_name,
    note: row.note,
    title: row.title,
    executionDate: row.execution_date,
    executionTime: row.execution_time,
    shift: (row.shift as ExecutionDto['shift']) ?? null,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdByPositions: row.created_by_positions ?? null,
    mainPerformerId: row.main_performer_id,
    mainPerformerName: row.main_performer_name,
    supervisorId: row.supervisor_id,
    supervisorName: row.supervisor_name,
    approvalRequestedBy: row.approval_requested_by,
    approvalRequestedByName: row.approval_requested_by_name,
    approvalRequestedAt: row.approval_requested_at,
    approvedBy: row.approved_by,
    approvedByName: row.approved_by_name,
    approvedAt: row.approved_at,
    approvalNote: row.approval_note,
    startedAt: row.started_at,
    reviews,
    rejectedStepCount,
    lastRejectKind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps: steps.map((s) => toExecutionStepDto(s, byStep.get(s.id) ?? [], redoCountByStep.get(s.id) ?? 0)),
  };
}

/* ---------- D-18: nhật ký duyệt lượt thực hiện ---------- */

interface ExecutionReviewRow {
  id: string;
  action: string;
  actor_id: string;
  actor_name: string | null;
  reason: string | null;
  step_ids: string | null;
  created_at: string;
}

function parseStepIds(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

/**
 * D-21b: loại reject của review gần nhất (để danh sách hiện badge đồng nhất):
 * 'steps' = từ chối theo bước (có stepIds), 'all' = từ chối cả lượt, null = không phải reject.
 */
export function lastRejectKindOf(
  reviews: Pick<ExecutionReviewDto, 'action' | 'stepIds'>[],
): 'steps' | 'all' | null {
  const latest = reviews[0];
  if (!latest || latest.action !== 'reject') return null;
  return latest.stepIds ? 'steps' : 'all';
}

function toExecutionReviewDto(r: ExecutionReviewRow): ExecutionReviewDto {
  return {
    id: r.id,
    action: r.action as ExecutionReviewAction,
    actorId: r.actor_id,
    actorName: r.actor_name,
    reason: r.reason,
    stepIds: parseStepIds(r.step_ids),
    createdAt: r.created_at,
  };
}

/** Ghi một dòng nhật ký duyệt (gọi sau khi transition thành công). */
export async function addExecutionReview(
  db: D1Database,
  input: { executionId: string; action: ExecutionReviewAction; actorId: string; reason?: string | null; stepIds?: string[] | null },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO execution_reviews (id, execution_id, action, actor_id, reason, step_ids, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(
      newId(), input.executionId, input.action, input.actorId, input.reason ?? null,
      input.stepIds ? JSON.stringify(input.stepIds) : null, new Date().toISOString(),
    )
    .run();
}

/** Nhật ký duyệt của lượt — mới nhất trước. */
export async function listExecutionReviews(db: D1Database, executionId: string): Promise<ExecutionReviewDto[]> {
  const rows = await db
    .prepare(
      `SELECT r.id, r.action, r.actor_id, u.display_name AS actor_name, r.reason, r.step_ids, r.created_at
       FROM execution_reviews r LEFT JOIN users u ON u.id = r.actor_id
       WHERE r.execution_id = ?1 ORDER BY r.created_at DESC`,
    )
    .bind(executionId)
    .all<ExecutionReviewRow>();
  return (rows.results ?? []).map(toExecutionReviewDto);
}
