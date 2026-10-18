import type {
  ApprovalRecordDto,
  PositionDto,
  ProcessDto,
  ProcessStepDto,
  ProcessVersionDto,
  ReviewCommentDto,
  UpsertStepBody,
} from '@giangdc-sop/contracts';

/* ---------- Row types ---------- */

interface ProcessRow {
  id: string;
  code: string;
  name: string;
  purpose: string | null;
  scope: string | null;
  applicable_to: string | null;
  start_condition: string | null;
  end_condition: string | null;
  owner_id: string | null;
  org_unit_id: string | null;
  review_trigger: string | null;
  process_group: string;
  status: string;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
  active_version_no: number | null;
  has_scheduled: number | null;
  latest_version_state: string | null;
}

/** Cột suy ra trạng thái bản cho thẻ quy trình (D-13: "Đang dùng" = có bản phát hành). */
const PROCESS_VERSION_INFO = `
  (SELECT v.version_no FROM process_versions v WHERE v.process_id = p.id AND v.state = 'ACTIVE' LIMIT 1) AS active_version_no,
  (SELECT 1 FROM process_versions v WHERE v.process_id = p.id AND v.state = 'SCHEDULED' LIMIT 1) AS has_scheduled,
  (SELECT v2.state FROM process_versions v2 WHERE v2.process_id = p.id ORDER BY v2.version_no DESC LIMIT 1) AS latest_version_state
`;

interface VersionRow {
  id: string;
  process_id: string;
  version_no: number;
  state: string;
  change_summary: string | null;
  change_size: string | null;
  impact_assessment: string | null;
  effective_from: string | null;
  created_by: string | null;
  created_by_name: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

interface StepRow {
  id: string;
  version_id: string;
  code: string;
  title: string;
  prerequisites: string | null;
  inputs: string | null;
  instructions: string | null;
  expected_result: string | null;
  outputs: string | null;
  notes: string | null;
  performer_position_ids_json: string;
  supervisor_position_ids_json: string;
  required: number;
  target_duration_min: number | null;
  warnings: string | null;
  sort_order: number;
  completion_json: string;
  skip_json: string;
  failure_policy: string;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Chuẩn hóa skip_json: khóa mới `allowedPositions` (id chức vụ, D-10);
 * tương thích ngược khóa cũ `allowedRoles` cho dòng chưa migrate.
 */
export function normalizeSkip(raw: unknown): {
  allowed: boolean;
  allowedPositions: string[];
  reasonRequired: boolean;
  approvalLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKING' | null;
} {
  const o = (raw ?? {}) as Record<string, unknown>;
  const legacy = Array.isArray(o.allowedRoles) ? (o.allowedRoles as unknown[]) : [];
  const cur = Array.isArray(o.allowedPositions) ? (o.allowedPositions as unknown[]) : legacy;
  return {
    allowed: o.allowed === true,
    allowedPositions: cur.filter((x): x is string => typeof x === 'string'),
    reasonRequired: o.reasonRequired !== false,
    approvalLevel: (['LOW', 'MEDIUM', 'HIGH', 'BLOCKING'] as const).includes(
      o.approvalLevel as 'LOW',
    )
      ? (o.approvalLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKING')
      : null,
  };
}

export function toProcessDto(r: ProcessRow): ProcessDto {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    purpose: r.purpose,
    scope: r.scope,
    applicableTo: r.applicable_to,
    startCondition: r.start_condition,
    endCondition: r.end_condition,
    ownerId: r.owner_id,
    orgUnitId: r.org_unit_id,
    reviewTrigger: r.review_trigger,
    processGroup: r.process_group,
    status: r.status as 'ACTIVE' | 'ARCHIVED',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdByName: r.created_by_name,
    activeVersionNo: r.active_version_no ?? null,
    hasScheduledVersion: r.has_scheduled === 1,
    latestVersionState: (r.latest_version_state as ProcessDto['latestVersionState']) ?? null,
  };
}

export function toVersionDto(r: VersionRow): ProcessVersionDto {
  return {
    id: r.id,
    processId: r.process_id,
    versionNo: r.version_no,
    state: r.state as ProcessVersionDto['state'],
    changeSummary: r.change_summary,
    changeSize: r.change_size as ProcessVersionDto['changeSize'],
    impactAssessment: r.impact_assessment,
    effectiveFrom: r.effective_from,
    createdBy: r.created_by,
    createdByName: r.created_by_name ?? null,
    revision: r.revision,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    voidedAt: r.voided_at ?? null,
    voidReason: r.void_reason ?? null,
  };
}

/** Chuẩn hóa mảng id: trim, loại rỗng, dedupe, tối đa 20. */
function normalizeIdList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const r of v) {
    if (typeof r !== 'string') continue;
    const t = r.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

interface PositionRow {
  id: string;
  code: string;
  name: string;
}

/** Danh sách chức vụ (D-09), sắp theo tên. */
export async function listPositions(db: D1Database): Promise<PositionDto[]> {
  const rows = await db
    .prepare('SELECT id, code, name FROM positions ORDER BY name ASC')
    .all<PositionRow>();
  return (rows.results ?? []).map((r) => ({ id: r.id, code: r.code, name: r.name }));
}

/** Kiểm tra các id chức vụ có tồn tại; trả về danh sách id KHÔNG tồn tại. */
export async function unknownPositionIds(db: D1Database, ids: string[]): Promise<string[]> {
  const clean = normalizeIdList(ids);
  if (clean.length === 0) return [];
  const placeholders = clean.map((_, i) => `?${i + 1}`).join(',');
  const rows = await db
    .prepare(`SELECT id FROM positions WHERE id IN (${placeholders})`)
    .bind(...clean)
    .all<{ id: string }>();
  const found = new Set((rows.results ?? []).map((r) => r.id));
  return clean.filter((id) => !found.has(id));
}

/** Resolve id chức vụ → DTO; id lạ giữ lại dạng {id, code: id, name: id} để không mất dữ liệu. */
function resolvePositions(ids: string[], posById: Map<string, PositionDto>): PositionDto[] {
  return normalizeIdList(ids).map(
    (id) => posById.get(id) ?? { id, code: id, name: id },
  );
}

export function toStepDto(r: StepRow, posById: Map<string, PositionDto>): ProcessStepDto {
  return {
    id: r.id,
    versionId: r.version_id,
    code: r.code,
    title: r.title,
    prerequisites: r.prerequisites,
    inputs: r.inputs,
    instructions: r.instructions,
    expectedResult: r.expected_result,
    outputs: r.outputs,
    notes: r.notes,
    performerPositions: resolvePositions(safeJsonParse<string[]>(r.performer_position_ids_json, []), posById),
    supervisorPositions: resolvePositions(safeJsonParse<string[]>(r.supervisor_position_ids_json, []), posById),
    required: r.required === 1,
    targetDurationMin: r.target_duration_min,
    warnings: r.warnings,
    sortOrder: r.sort_order,
    completion: safeJsonParse(r.completion_json, []),
    skip: normalizeSkip(safeJsonParse(r.skip_json, null)),
    failurePolicy: r.failure_policy as ProcessStepDto['failurePolicy'],
  };
}

/* ---------- Processes ---------- */

export async function listProcesses(
  db: D1Database,
  filter: { q?: string; group?: string; status?: string; orgUnitId?: string; hasActiveVersion?: boolean },
  limit: number,
  offset: number,
): Promise<{ items: ProcessDto[]; total: number }> {
  const conds: string[] = [];
  const binds: unknown[] = [];
  if (filter.q) {
    conds.push('(p.code LIKE ? OR p.name LIKE ?)');
    binds.push(`%${filter.q}%`, `%${filter.q}%`);
  }
  if (filter.group) {
    conds.push('p.process_group = ?');
    binds.push(filter.group);
  }
  if (filter.status) {
    conds.push('p.status = ?');
    binds.push(filter.status);
  }
  if (filter.orgUnitId) {
    conds.push('p.org_unit_id = ?');
    binds.push(filter.orgUnitId);
  }
  if (filter.hasActiveVersion) {
    conds.push(`EXISTS (SELECT 1 FROM process_versions v WHERE v.process_id = p.id AND v.state = 'ACTIVE')`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const from = 'FROM processes p LEFT JOIN users u ON u.id = p.created_by';
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS c ${from} ${where}`)
    .bind(...binds)
    .first<{ c: number }>();
  const rows = await db
    .prepare(`SELECT p.*, u.display_name AS created_by_name, ${PROCESS_VERSION_INFO} ${from} ${where} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, limit, offset)
    .all<ProcessRow>();
  return { items: (rows.results ?? []).map(toProcessDto), total: totalRow?.c ?? 0 };
}

export async function findProcess(db: D1Database, id: string): Promise<ProcessDto | null> {
  const row = await db
    .prepare(`SELECT p.*, u.display_name AS created_by_name, ${PROCESS_VERSION_INFO} FROM processes p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = ?1`)
    .bind(id)
    .first<ProcessRow>();
  return row ? toProcessDto(row) : null;
}

export async function findProcessByCode(db: D1Database, code: string): Promise<ProcessDto | null> {
  const row = await db
    .prepare(`SELECT p.*, u.display_name AS created_by_name, ${PROCESS_VERSION_INFO} FROM processes p LEFT JOIN users u ON u.id = p.created_by WHERE p.code = ?1`)
    .bind(code)
    .first<ProcessRow>();
  return row ? toProcessDto(row) : null;
}

/* ---------- Versions ---------- */

export async function listVersions(db: D1Database, processId: string): Promise<ProcessVersionDto[]> {
  const rows = await db
    .prepare('SELECT v.*, u.display_name AS created_by_name FROM process_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.process_id = ?1 ORDER BY v.version_no DESC')
    .bind(processId)
    .all<VersionRow>();
  return (rows.results ?? []).map(toVersionDto);
}

export async function findVersion(db: D1Database, id: string): Promise<ProcessVersionDto | null> {
  const row = await db
    .prepare('SELECT v.*, u.display_name AS created_by_name FROM process_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.id = ?1')
    .bind(id)
    .first<VersionRow>();
  return row ? toVersionDto(row) : null;
}

export async function getVersionSteps(db: D1Database, versionId: string): Promise<ProcessStepDto[]> {
  const posById = new Map((await listPositions(db)).map((p) => [p.id, p] as const));
  const rows = await db
    .prepare('SELECT * FROM process_steps WHERE version_id = ?1 ORDER BY sort_order ASC')
    .bind(versionId)
    .all<StepRow>();
  return (rows.results ?? []).map((r) => toStepDto(r, posById));
}

export async function findStep(db: D1Database, stepId: string): Promise<ProcessStepDto | null> {
  const row = await db
    .prepare('SELECT * FROM process_steps WHERE id = ?1')
    .bind(stepId)
    .first<StepRow>();
  if (!row) return null;
  const posById = new Map((await listPositions(db)).map((p) => [p.id, p] as const));
  return toStepDto(row, posById);
}

/** Update có kiểm tra revision (optimistic concurrency, SRS §12.2). Trả false nếu revision lệch. */
export async function updateVersionState(
  db: D1Database,
  versionId: string,
  patch: {
    state?: string;
    changeSummary?: string | null;
    changeSize?: string | null;
    impactAssessment?: string | null;
    effectiveFrom?: string | null;
  },
  expectedRevision: number,
): Promise<boolean> {
  const sets: string[] = ['revision = revision + 1', "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"];
  const binds: unknown[] = [];
  if (patch.state !== undefined) {
    sets.push('state = ?');
    binds.push(patch.state);
  }
  if (patch.changeSummary !== undefined) {
    sets.push('change_summary = ?');
    binds.push(patch.changeSummary);
  }
  if (patch.changeSize !== undefined) {
    sets.push('change_size = ?');
    binds.push(patch.changeSize);
  }
  if (patch.impactAssessment !== undefined) {
    sets.push('impact_assessment = ?');
    binds.push(patch.impactAssessment);
  }
  if (patch.effectiveFrom !== undefined) {
    sets.push('effective_from = ?');
    binds.push(patch.effectiveFrom);
  }
  const res = await db
    .prepare(`UPDATE process_versions SET ${sets.join(', ')} WHERE id = ? AND revision = ?`)
    .bind(...binds, versionId, expectedRevision)
    .run();
  return (res.meta.changes ?? 0) === 1;
}

export function stepBodyToColumns(body: UpsertStepBody): Record<string, unknown> {
  // D-09: chức vụ (id tham chiếu positions), chuẩn hóa trim/dedupe/≤20.
  const performerPositionIds = normalizeIdList(body.performerPositionIds);
  const supervisorPositionIds = normalizeIdList(body.supervisorPositionIds);
  return {
    code: body.code.trim(),
    title: body.title.trim(),
    prerequisites: body.prerequisites ?? null,
    inputs: body.inputs ?? null,
    instructions: body.instructions ?? null,
    expected_result: body.expectedResult ?? null,
    outputs: body.outputs ?? null,
    notes: body.notes ?? null,
    performer_position_ids_json: JSON.stringify(performerPositionIds),
    supervisor_position_ids_json: JSON.stringify(supervisorPositionIds),
    required: body.required === false ? 0 : 1,
    target_duration_min: body.targetDurationMin ?? null,
    warnings: body.warnings ?? null,
    completion_json: JSON.stringify(body.completion ?? []),
    skip_json: JSON.stringify(
      body.skip ?? { allowed: false, allowedPositions: [], reasonRequired: true, approvalLevel: null },
    ),
    failure_policy: body.failurePolicy ?? 'STOP',
  };
}

/* ---------- Comments & approvals ---------- */

export async function listComments(db: D1Database, versionId: string): Promise<ReviewCommentDto[]> {
  const rows = await db
    .prepare(
      `SELECT c.*, u.display_name AS author_name, s.code AS step_code
       FROM review_comments c
       JOIN users u ON u.id = c.author_id
       LEFT JOIN process_steps s ON s.id = c.step_id
       WHERE c.version_id = ?1 ORDER BY c.created_at ASC`,
    )
    .bind(versionId)
    .all<
      {
        id: string;
        version_id: string;
        step_id: string | null;
        step_code: string | null;
        author_id: string;
        author_name: string;
        body: string;
        resolved_at: string | null;
        created_at: string;
      }
    >();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    versionId: r.version_id,
    stepId: r.step_id,
    stepCode: r.step_code,
    authorId: r.author_id,
    authorName: r.author_name,
    body: r.body,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
  }));
}

export async function listApprovals(db: D1Database, versionId: string): Promise<ApprovalRecordDto[]> {
  const rows = await db
    .prepare(
      `SELECT a.*, u.display_name AS approver_name
       FROM approval_records a JOIN users u ON u.id = a.approver_id
       WHERE a.version_id = ?1 ORDER BY a.created_at ASC`,
    )
    .bind(versionId)
    .all<
      {
        id: string;
        version_id: string;
        approver_id: string;
        approver_name: string;
        approver_role: string;
        decision: string;
        reason: string | null;
        self_approved: number;
        flagged: number;
        created_at: string;
      }
    >();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    versionId: r.version_id,
    approverId: r.approver_id,
    approverName: r.approver_name,
    approverRole: r.approver_role,
    decision: r.decision as ApprovalRecordDto['decision'],
    reason: r.reason,
    selfApproved: r.self_approved === 1,
    flagged: r.flagged === 1,
    createdAt: r.created_at,
  }));
}
