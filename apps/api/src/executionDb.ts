/**
 * DB layer cho Lượt thực hiện + Bằng chứng (T3, D-12).
 */
import type {
  EvidenceDto,
  ExecutionDto,
  ExecutionStepDto,
} from '@giangdc-sop/contracts';
import { normalizeSkip } from './processDb.js';

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
  created_by: string;
  created_by_name: string | null;
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
         e.created_by, e.created_at, e.updated_at,
         p.code AS process_code, p.name AS process_name,
         pv.version_no AS version_no,
         ou.name AS org_unit_name,
         u.display_name AS created_by_name
  FROM executions e
  JOIN processes p ON p.id = e.process_id
  JOIN process_versions pv ON pv.id = e.version_id
  LEFT JOIN org_units ou ON ou.id = e.org_unit_id
  LEFT JOIN users u ON u.id = e.created_by
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
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps: steps.map((s) => toExecutionStepDto(s, byStep.get(s.id) ?? [])),
  };
}
