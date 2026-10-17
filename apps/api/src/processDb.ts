import type {
  ApprovalRecordDto,
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
}

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
  revision: number;
  created_at: string;
  updated_at: string;
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
  role: string | null;
  roles_json: string;
  supervisor_roles_json: string;
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
    revision: r.revision,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Chuẩn hóa mảng vai trò: trim, loại rỗng, dedupe, tối đa 20. */
function normalizeRoles(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const r of v) {
    if (typeof r !== 'string') continue;
    const t = r.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

export function toStepDto(r: StepRow): ProcessStepDto {
  const roles = normalizeRoles(safeJsonParse<unknown>(r.roles_json, []));
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
    /** @deprecated = roles[0] ?? cột role cũ ?? null (tương thích đọc). */
    role: roles[0] ?? r.role ?? null,
    roles,
    supervisorRoles: normalizeRoles(safeJsonParse<unknown>(r.supervisor_roles_json, [])),
    required: r.required === 1,
    targetDurationMin: r.target_duration_min,
    warnings: r.warnings,
    sortOrder: r.sort_order,
    completion: safeJsonParse(r.completion_json, []),
    skip: safeJsonParse(r.skip_json, {
      allowed: false,
      allowedRoles: [],
      reasonRequired: true,
      approvalLevel: null,
    }),
    failurePolicy: r.failure_policy as ProcessStepDto['failurePolicy'],
  };
}

/* ---------- Processes ---------- */

export async function listProcesses(
  db: D1Database,
  filter: { q?: string; group?: string; status?: string; orgUnitId?: string },
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
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const from = 'FROM processes p LEFT JOIN users u ON u.id = p.created_by';
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS c ${from} ${where}`)
    .bind(...binds)
    .first<{ c: number }>();
  const rows = await db
    .prepare(`SELECT p.*, u.display_name AS created_by_name ${from} ${where} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, limit, offset)
    .all<ProcessRow>();
  return { items: (rows.results ?? []).map(toProcessDto), total: totalRow?.c ?? 0 };
}

export async function findProcess(db: D1Database, id: string): Promise<ProcessDto | null> {
  const row = await db
    .prepare('SELECT p.*, u.display_name AS created_by_name FROM processes p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = ?1')
    .bind(id)
    .first<ProcessRow>();
  return row ? toProcessDto(row) : null;
}

export async function findProcessByCode(db: D1Database, code: string): Promise<ProcessDto | null> {
  const row = await db
    .prepare('SELECT p.*, u.display_name AS created_by_name FROM processes p LEFT JOIN users u ON u.id = p.created_by WHERE p.code = ?1')
    .bind(code)
    .first<ProcessRow>();
  return row ? toProcessDto(row) : null;
}

/* ---------- Versions ---------- */

export async function listVersions(db: D1Database, processId: string): Promise<ProcessVersionDto[]> {
  const rows = await db
    .prepare('SELECT * FROM process_versions WHERE process_id = ?1 ORDER BY version_no DESC')
    .bind(processId)
    .all<VersionRow>();
  return (rows.results ?? []).map(toVersionDto);
}

export async function findVersion(db: D1Database, id: string): Promise<ProcessVersionDto | null> {
  const row = await db
    .prepare('SELECT * FROM process_versions WHERE id = ?1')
    .bind(id)
    .first<VersionRow>();
  return row ? toVersionDto(row) : null;
}

export async function getVersionSteps(db: D1Database, versionId: string): Promise<ProcessStepDto[]> {
  const rows = await db
    .prepare('SELECT * FROM process_steps WHERE version_id = ?1 ORDER BY sort_order ASC')
    .bind(versionId)
    .all<StepRow>();
  return (rows.results ?? []).map(toStepDto);
}

export async function findStep(db: D1Database, stepId: string): Promise<ProcessStepDto | null> {
  const row = await db
    .prepare('SELECT * FROM process_steps WHERE id = ?1')
    .bind(stepId)
    .first<StepRow>();
  return row ? toStepDto(row) : null;
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
  // Tương thích ghi: `role` cũ map vào `roles` khi `roles` không có.
  const roles = normalizeRoles(
    body.roles && body.roles.length > 0 ? body.roles : body.role ? [body.role] : [],
  );
  return {
    code: body.code.trim(),
    title: body.title.trim(),
    prerequisites: body.prerequisites ?? null,
    inputs: body.inputs ?? null,
    instructions: body.instructions ?? null,
    expected_result: body.expectedResult ?? null,
    outputs: body.outputs ?? null,
    notes: body.notes ?? null,
    role: roles[0] ?? body.role ?? null,
    roles_json: JSON.stringify(roles),
    supervisor_roles_json: JSON.stringify(normalizeRoles(body.supervisorRoles)),
    required: body.required === false ? 0 : 1,
    target_duration_min: body.targetDurationMin ?? null,
    warnings: body.warnings ?? null,
    completion_json: JSON.stringify(body.completion ?? []),
    skip_json: JSON.stringify(
      body.skip ?? { allowed: false, allowedRoles: [], reasonRequired: true, approvalLevel: null },
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
