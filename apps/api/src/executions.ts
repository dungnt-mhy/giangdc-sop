/**
 * API Lượt thực hiện + Bằng chứng (T3, D-12).
 * EXE-001..013, EVD-001..013 (phạm vi D-12: tạo lượt, chạy bước, chụp ảnh, phân quyền).
 */
import { Hono } from 'hono';
import {
  allRequiredStepsDone,
  assigneeMatchesPositions,
  canStepTransition,
  canTransition,
  generateExecutionCode,
  hasScope,
  photoRequired,
  type Permission,
} from '@giangdc-sop/domain';
import type {
  CreateExecutionBody,
  ExecutionDto,
} from '@giangdc-sop/contracts';
import {
  findActiveUser,
  findEvidence,
  findExecution,
  findExecutionByCode,
  findExecutionStep,
  getExecutionSteps,
  getUserPositionIds,
  listAssignableUsers,
  listEvidenceForSteps,
  listExecutions,
  toEvidenceDto,
  toExecutionDto,
  toExecutionStepDto,
} from './executionDb.js';
import { findProcess, findVersion as findVersionDb, getVersionSteps } from './processDb.js';
import { getUserScopes, writeAudit } from './db.js';
import { errorBody, requireAuth, requirePermission } from './middleware.js';
import { withIdempotency } from './processes.js';
import type { AppEnv, AuthSession } from './env.js';

function newId(): string {
  return crypto.randomUUID();
}

async function parseJson<T>(c: { req: { json(): Promise<T> } }): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export const executionApp = new Hono<AppEnv>();

interface ScopeCheck {
  ok: boolean;
  response?: Response;
}

/**
 * Kiểm tra scope của lượt (OPEN-SCOPE-01): trong scope -> ok;
 * ngoài scope + có scope.manage -> ok + audit cross-scope;
 * ngoài scope -> 403 FORBIDDEN_SCOPE + audit.
 */
async function checkExecutionScope(
  c: {
    env: { DB: D1Database };
    get(key: string): unknown;
    json(body: unknown, status?: number): Response;
  },
  orgUnitId: string | null,
  objectId: string,
): Promise<ScopeCheck> {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  if (!orgUnitId) return { ok: true };
  const scopes = await getUserScopes(c.env.DB, session.user_id);
  const inScope = hasScope(
    scopes.map((id) => ({ userId: session.user_id, orgUnitId: id })),
    orgUnitId,
  );
  if (inScope) return { ok: true };
  const permissions = new Set((c.get('permissions') ?? []) as string[]);
  if (permissions.has('scope.manage')) {
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'execution.cross_scope_access',
      objectType: 'execution', objectId, reason: `cross-scope ${orgUnitId}`, flagged: true, requestId,
    });
    return { ok: true };
  }
  await writeAudit(c.env.DB, {
    id: newId(), actorId: session.user_id, action: 'security.access_denied_scope',
    objectType: 'execution', objectId, requestId,
  });
  return {
    ok: false,
    response: c.json(errorBody('FORBIDDEN_SCOPE', 'Không có quyền trên đơn vị của lượt này.', requestId), 403),
  };
}

/** POST /executions — tạo lượt từ bản ACTIVE (BR-014: Idempotency-Key bắt buộc). */
executionApp.post('/executions', requireAuth, requirePermission('execution.create' as Permission), async (c) => {
  const body = await parseJson<CreateExecutionBody>(c);
  return withIdempotency(c, 'execution.create', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const db = c.env.DB;
    if (!body || !body.processVersionId) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu processVersionId.', requestId) };
    }
    const version = await findVersionDb(db, body.processVersionId);
    if (!version) {
      return { status: 404, body: errorBody('VERSION_NOT_FOUND', 'Không tìm thấy phiên bản quy trình.', requestId) };
    }
    if (version.state !== 'ACTIVE') {
      return {
        status: 409,
        body: errorBody('VERSION_NOT_ACTIVE', `Chỉ tạo lượt từ bản ACTIVE (hiện tại: ${version.state}).`, requestId),
      };
    }
    const versionSteps = await getVersionSteps(db, version.id);
    if (versionSteps.length === 0) {
      return { status: 409, body: errorBody('VERSION_NO_STEPS', 'Bản quy trình chưa có bước nào.', requestId) };
    }
    // Scope: ưu tiên orgUnitId do người tạo chọn, mặc định theo quy trình.
    const process = await findProcess(db, version.processId);
    const orgUnitId = body.orgUnitId ?? process?.orgUnitId ?? null;
    const scopeCheck = await checkExecutionScope(c, orgUnitId, `new:${version.id}`);
    if (!scopeCheck.ok) return { status: 403, body: scopeCheck.response };
    // Assignments phải phủ toàn bộ bước.
    const assignments = body.assignments ?? [];
    const stepById = new Map(versionSteps.map((s) => [s.id, s]));
    if (assignments.length !== versionSteps.length) {
      return {
        status: 400,
        body: errorBody('ASSIGNMENTS_INCOMPLETE', `Phải gán người cho toàn bộ ${versionSteps.length} bước.`, requestId),
      };
    }
    const seenSteps = new Set<string>();
    for (const a of assignments) {
      const step = stepById.get(a.stepId);
      if (!step) {
        return { status: 400, body: errorBody('UNKNOWN_STEP', `Bước không thuộc bản này: ${a.stepId}.`, requestId) };
      }
      if (seenSteps.has(a.stepId)) {
        return { status: 400, body: errorBody('DUPLICATE_ASSIGNMENT', `Bước bị gán trùng: ${step.code}.`, requestId) };
      }
      seenSteps.add(a.stepId);
      const performer = await findActiveUser(db, a.performerUserId);
      if (!performer) {
        return { status: 400, body: errorBody('UNKNOWN_USER', `Người thực hiện không tồn tại/không hoạt động: ${a.performerUserId}.`, requestId) };
      }
      const performerPos = await getUserPositionIds(db, a.performerUserId);
      const needPerformerPos = step.performerPositions.map((p) => p.id);
      if (!assigneeMatchesPositions(needPerformerPos, performerPos)) {
        return {
          status: 400,
          body: errorBody('ASSIGNEE_POSITION_MISMATCH', `Người thực hiện bước ${step.code} phải giữ chức vụ: ${step.performerPositions.map((p) => p.name).join(', ') || '—'}.`, requestId),
        };
      }
      if (a.supervisorUserId) {
        const supervisor = await findActiveUser(db, a.supervisorUserId);
        if (!supervisor) {
          return { status: 400, body: errorBody('UNKNOWN_USER', `Người giám sát không tồn tại/không hoạt động: ${a.supervisorUserId}.`, requestId) };
        }
        const supervisorPos = await getUserPositionIds(db, a.supervisorUserId);
        const needSupervisorPos = step.supervisorPositions.map((p) => p.id);
        if (!assigneeMatchesPositions(needSupervisorPos, supervisorPos)) {
          return {
            status: 400,
            body: errorBody('ASSIGNEE_POSITION_MISMATCH', `Người giám sát bước ${step.code} phải giữ chức vụ: ${step.supervisorPositions.map((p) => p.name).join(', ') || '—'}.`, requestId),
          };
        }
      }
    }
    // Sinh mã lượt duy nhất.
    let code = '';
    for (let i = 0; i < 5; i++) {
      const candidate = generateExecutionCode();
      if (!(await findExecutionByCode(db, candidate))) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return { status: 500, body: errorBody('CODE_GENERATION_FAILED', 'Không sinh được mã lượt, thử lại.', requestId) };
    }
    const executionId = newId();
    const now = new Date().toISOString();
    const stepInserts = assignments.map((a) => {
      const step = stepById.get(a.stepId)!;
      return db.prepare(
        `INSERT INTO execution_steps
           (id, execution_id, version_step_id, step_code, title, sort_order, state, required,
            performer_user_id, supervisor_user_id, completion_json, skip_json)
         VALUES (?1,?2,?3,?4,?5,?6,'PENDING',?7,?8,?9,?10,?11)`,
      ).bind(
        newId(), executionId, step.id, step.code, step.title, step.sortOrder,
        step.required ? 1 : 0, a.performerUserId, a.supervisorUserId ?? null,
        JSON.stringify(step.completion ?? []),
        JSON.stringify(step.skip ?? { allowed: false, allowedPositions: [], reasonRequired: true, approvalLevel: null }),
      );
    });
    await db.batch([
      db.prepare(
        `INSERT INTO executions (id, code, process_id, version_id, state, org_unit_id, note, created_by, created_at, updated_at)
         VALUES (?1,?2,?3,?4,'CREATED',?5,?6,?7,?8,?8)`,
      ).bind(
        executionId, code, version.processId, version.id,
        orgUnitId, body.note?.trim() || null, session.user_id, now,
      ),
      ...stepInserts,
    ]);
    await writeAudit(db, {
      id: newId(), actorId: session.user_id, action: 'execution.create',
      objectType: 'execution', objectId: executionId, reason: code, requestId,
    });
    const row = await findExecution(db, executionId);
    const execution = row ? await toExecutionDto(db, row) : null;
    return { status: 201, body: { execution } };
  });
});

/** GET /executions — danh sách (lọc scope; ?mine=1 chỉ lượt có bước gán cho tôi). */
executionApp.get('/executions', requireAuth, requirePermission('execution.view' as Permission), async (c) => {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const permissions = new Set((c.get('permissions') ?? []) as string[]);
  const scopes = await getUserScopes(c.env.DB, session.user_id);
  const orgUnitIds = permissions.has('scope.manage') ? null : scopes;
  const mine = c.req.query('mine') === '1';
  const state = c.req.query('state') || undefined;
  const rows = await listExecutions(c.env.DB, {
    orgUnitIds,
    mineUserId: mine ? session.user_id : undefined,
    state,
    limit: 50,
  });
  const items: ExecutionDto[] = [];
  for (const r of rows) items.push(await toExecutionDto(c.env.DB, r));
  return c.json({ items, requestId });
});

/** GET /executions/:id — chi tiết kèm bước + bằng chứng. */
executionApp.get('/executions/:id', requireAuth, requirePermission('execution.view' as Permission), async (c) => {
  const requestId = c.get('requestId') as string;
  const row = await findExecution(c.env.DB, c.req.param('id'));
  if (!row) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy lượt thực hiện.', requestId), 404);
  }
  const scopeCheck = await checkExecutionScope(c, row.org_unit_id, row.id);
  if (!scopeCheck.ok) return scopeCheck.response;
  return c.json({ execution: await toExecutionDto(c.env.DB, row) });
});

/** GET /assignable-users — danh sách user để gán bước (kèm chức vụ). */
executionApp.get('/assignable-users', requireAuth, requirePermission('execution.create' as Permission), async (c) => {
  const users = await listAssignableUsers(c.env.DB);
  return c.json({ items: users });
});

interface StepOpContext {
  executionId: string;
  stepId: string;
}

/** Nạp lượt + bước + kiểm tra scope; trả về lỗi Response hoặc dữ liệu. */
async function loadStepOp(
  c: {
    env: { DB: D1Database };
    get(key: string): unknown;
    json(body: unknown, status?: number): Response;
    req: { param(name: string): string };
  },
  ctx: StepOpContext,
) {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const row = await findExecution(c.env.DB, ctx.executionId);
  if (!row) {
    return { error: c.json(errorBody('NOT_FOUND', 'Không tìm thấy lượt thực hiện.', requestId), 404) as Response };
  }
  const scopeCheck = await checkExecutionScope(c, row.org_unit_id, row.id);
  if (!scopeCheck.ok) return { error: scopeCheck.response as Response };
  const step = await findExecutionStep(c.env.DB, ctx.executionId, ctx.stepId);
  if (!step) {
    return { error: c.json(errorBody('STEP_NOT_FOUND', 'Không tìm thấy bước trong lượt này.', requestId), 404) as Response };
  }
  if (step.performer_user_id !== session.user_id) {
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'execution.step_forbidden',
      objectType: 'execution_step', objectId: step.id,
      reason: `không phải người được gán (gán cho ${step.performer_user_id})`, flagged: true, requestId,
    });
    return {
      error: c.json(errorBody('ASSIGNEE_ONLY', 'Chỉ người được gán bước này mới được thao tác.', requestId), 403) as Response,
    };
  }
  return { row, step, session, requestId };
}

/** POST /executions/:id/steps/:stepId/start — bắt đầu bước. */
executionApp.post(
  '/executions/:id/steps/:stepId/start',
  requireAuth,
  requirePermission('execution.operate' as Permission),
  async (c) => {
    const loaded = await loadStepOp(c, { executionId: c.req.param('id'), stepId: c.req.param('stepId') });
    if ('error' in loaded) return loaded.error;
    const { row, step, session, requestId } = loaded;
    if (!['CREATED', 'IN_PROGRESS'].includes(row.state)) {
      return c.json(errorBody('EXECUTION_STATE_INVALID', `Lượt ở trạng thái ${row.state}, không thể bắt đầu bước.`, requestId), 409);
    }
    if (!canStepTransition(step.state as 'PENDING', 'IN_PROGRESS')) {
      return c.json(errorBody('STEP_STATE_INVALID', `Bước đang ở trạng thái ${step.state}.`, requestId), 409);
    }
    const now = new Date().toISOString();
    const batch = [
      c.env.DB.prepare(
        `UPDATE execution_steps SET state = 'IN_PROGRESS', started_at = ?1 WHERE id = ?2`,
      ).bind(now, step.id),
    ];
    let newExecState = row.state;
    if (row.state === 'CREATED' && canTransition('CREATED', 'IN_PROGRESS')) {
      newExecState = 'IN_PROGRESS';
      batch.push(
        c.env.DB.prepare(`UPDATE executions SET state = 'IN_PROGRESS', updated_at = ?1 WHERE id = ?2`).bind(now, row.id),
      );
    }
    await c.env.DB.batch(batch);
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'execution.step_start',
      objectType: 'execution_step', objectId: step.id, reason: `${row.code}/${step.step_code}`, requestId,
    });
    const updated = await findExecutionStep(c.env.DB, row.id, step.id);
    return c.json({ step: updated ? toExecutionStepDto(updated, []) : null, executionState: newExecState });
  },
);

/** POST /executions/:id/steps/:stepId/complete — hoàn thành bước (D-12: PHOTO bắt buộc nếu cấu hình). */
executionApp.post(
  '/executions/:id/steps/:stepId/complete',
  requireAuth,
  requirePermission('execution.operate' as Permission),
  async (c) => {
    const loaded = await loadStepOp(c, { executionId: c.req.param('id'), stepId: c.req.param('stepId') });
    if ('error' in loaded) return loaded.error;
    const { row, step, session, requestId } = loaded;
    if (!canStepTransition(step.state as 'IN_PROGRESS', 'DONE')) {
      return c.json(errorBody('STEP_STATE_INVALID', `Bước đang ở trạng thái ${step.state}, chỉ hoàn thành được bước đang thực hiện.`, requestId), 409);
    }
    const completion = safeJsonParseCompletion(step.completion_json);
    if (photoRequired(completion)) {
      const photos = await listEvidenceForSteps(c.env.DB, [step.id]);
      if (!photos.some((p) => p.kind === 'PHOTO')) {
        return c.json(errorBody('PHOTO_REQUIRED', `Bước ${step.step_code} yêu cầu ảnh chụp (PRC-006) — hãy chụp ảnh trước khi hoàn thành.`, requestId), 400);
      }
    }
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE execution_steps SET state = 'DONE', completed_at = ?1 WHERE id = ?2`,
    ).bind(now, step.id).run();
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'execution.step_complete',
      objectType: 'execution_step', objectId: step.id, reason: `${row.code}/${step.step_code}`, requestId,
    });
    const updated = await findExecutionStep(c.env.DB, row.id, step.id);
    return c.json({ step: updated ? toExecutionStepDto(updated, []) : null });
  },
);

/** POST /executions/:id/complete — kết thúc lượt (mọi bước bắt buộc đã DONE). */
executionApp.post('/executions/:id/complete', requireAuth, requirePermission('execution.operate' as Permission), async (c) => {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const row = await findExecution(c.env.DB, c.req.param('id'));
  if (!row) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy lượt thực hiện.', requestId), 404);
  }
  const scopeCheck = await checkExecutionScope(c, row.org_unit_id, row.id);
  if (!scopeCheck.ok) return scopeCheck.response;
  if (!canTransition(row.state as 'IN_PROGRESS', 'COMPLETED')) {
    return c.json(errorBody('EXECUTION_STATE_INVALID', `Lượt ở trạng thái ${row.state}, không thể kết thúc.`, requestId), 409);
  }
  const steps = await getExecutionSteps(c.env.DB, row.id);
  if (!allRequiredStepsDone(steps.map((s) => ({ required: s.required === 1, state: s.state as 'PENDING' })))) {
    return c.json(errorBody('STEPS_INCOMPLETE', 'Còn bước bắt buộc chưa hoàn thành.', requestId), 400);
  }
  const now = new Date().toISOString();
  await c.env.DB.prepare(`UPDATE executions SET state = 'COMPLETED', updated_at = ?1 WHERE id = ?2`).bind(now, row.id).run();
  await writeAudit(c.env.DB, {
    id: newId(), actorId: session.user_id, action: 'execution.complete',
    objectType: 'execution', objectId: row.id, reason: row.code, requestId,
  });
  return c.json({ execution: await toExecutionDto(c.env.DB, (await findExecution(c.env.DB, row.id))!) });
});

/** POST /executions/:id/cancel — hủy lượt. */
executionApp.post('/executions/:id/cancel', requireAuth, requirePermission('execution.operate' as Permission), async (c) => {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const body = await parseJson<{ reason?: string }>(c);
  const row = await findExecution(c.env.DB, c.req.param('id'));
  if (!row) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy lượt thực hiện.', requestId), 404);
  }
  const scopeCheck = await checkExecutionScope(c, row.org_unit_id, row.id);
  if (!scopeCheck.ok) return scopeCheck.response;
  if (!canTransition(row.state as 'IN_PROGRESS', 'CANCELLED')) {
    return c.json(errorBody('EXECUTION_STATE_INVALID', `Lượt ở trạng thái ${row.state}, không thể hủy.`, requestId), 409);
  }
  const now = new Date().toISOString();
  await c.env.DB.prepare(`UPDATE executions SET state = 'CANCELLED', updated_at = ?1 WHERE id = ?2`).bind(now, row.id).run();
  await writeAudit(c.env.DB, {
    id: newId(), actorId: session.user_id, action: 'execution.cancel',
    objectType: 'execution', objectId: row.id, reason: body?.reason?.trim() || row.code, requestId,
  });
  return c.json({ execution: await toExecutionDto(c.env.DB, (await findExecution(c.env.DB, row.id))!) });
});

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  return 'jpg';
}

/**
 * POST /executions/:id/steps/:stepId/evidence — upload ảnh bằng chứng (D-12).
 * multipart/form-data: photo=<file>, kind?=PHOTO|FILE. Lưu R2, giới hạn 10MB.
 */
executionApp.post(
  '/executions/:id/steps/:stepId/evidence',
  requireAuth,
  requirePermission('execution.operate' as Permission),
  async (c) => {
    const loaded = await loadStepOp(c, { executionId: c.req.param('id'), stepId: c.req.param('stepId') });
    if ('error' in loaded) return loaded.error;
    const { row, step, session, requestId } = loaded;
    if (step.state !== 'IN_PROGRESS') {
      return c.json(errorBody('STEP_STATE_INVALID', 'Chỉ tải ảnh cho bước đang thực hiện.', requestId), 409);
    }
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json(errorBody('INVALID_REQUEST', 'Yêu cầu phải là multipart/form-data.', requestId), 400);
    }
    const rawFile = form.get('photo');
    const file: File | null =
      typeof rawFile === 'object' && rawFile !== null && 'arrayBuffer' in rawFile
        ? (rawFile as File)
        : null;
    if (!file) {
      return c.json(errorBody('INVALID_REQUEST', 'Thiếu file ảnh (trường "photo").', requestId), 400);
    }
    const kind = String(form.get('kind') ?? 'PHOTO').toUpperCase();
    if (!['PHOTO', 'FILE'].includes(kind)) {
      return c.json(errorBody('INVALID_REQUEST', 'Loại bằng chứng chỉ nhận PHOTO hoặc FILE.', requestId), 400);
    }
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      return c.json(errorBody('INVALID_MIME', `Định dạng ảnh không hỗ trợ: ${file.type || 'không rõ'}.`, requestId), 400);
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return c.json(errorBody('FILE_TOO_LARGE', 'Ảnh vượt quá 10MB.', requestId), 400);
    }
    if (file.size === 0) {
      return c.json(errorBody('INVALID_REQUEST', 'File ảnh rỗng.', requestId), 400);
    }
    const evidenceId = newId();
    const key = `evidence/${row.id}/${step.id}/${evidenceId}.${extForMime(file.type)}`;
    await c.env.EVIDENCE.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO evidence (id, execution_id, execution_step_id, kind, r2_key, file_name, mime_type, size_bytes, uploaded_by, uploaded_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
    ).bind(
      evidenceId, row.id, step.id, kind, key,
      file.name || `photo.${extForMime(file.type)}`, file.type, file.size,
      session.user_id, now,
    ).run();
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'evidence.upload',
      objectType: 'evidence', objectId: evidenceId,
      reason: `${row.code}/${step.step_code} ${(file.size / 1024).toFixed(0)}KB`, requestId,
    });
    const evRow = await findEvidence(c.env.DB, evidenceId);
    return c.json({ evidence: evRow ? toEvidenceDto(evRow) : null }, 201);
  },
);

/** GET /evidence/:id — tải file bằng chứng từ R2 (auth + scope). */
executionApp.get('/evidence/:id', requireAuth, requirePermission('execution.view' as Permission), async (c) => {
  const requestId = c.get('requestId') as string;
  const ev = await findEvidence(c.env.DB, c.req.param('id'));
  if (!ev) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy bằng chứng.', requestId), 404);
  }
  const execRow = await findExecution(c.env.DB, ev.execution_id);
  if (!execRow) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy lượt thực hiện.', requestId), 404);
  }
  const scopeCheck = await checkExecutionScope(c, execRow.org_unit_id, execRow.id);
  if (!scopeCheck.ok) return scopeCheck.response;
  const obj = await c.env.EVIDENCE.get(ev.r2_key);
  if (!obj) {
    return c.json(errorBody('FILE_MISSING', 'File bằng chứng không còn trên kho lưu trữ.', requestId), 404);
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type': ev.mime_type,
      'Content-Disposition': `inline; filename="${encodeURIComponent(ev.file_name)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

/* ---------- Helpers nội bộ ---------- */

/* ---------- Helpers nội bộ ---------- */

function safeJsonParseCompletion(raw: string | null): { kind: string; required: boolean }[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
