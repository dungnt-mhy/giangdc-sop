/**
 * API Lượt thực hiện + Bằng chứng (T3, D-12).
 * EXE-001..013, EVD-001..013 (phạm vi D-12: tạo lượt, chạy bước, chụp ảnh, phân quyền).
 */
import { Hono } from 'hono';
import {
  allRequiredStepsDone,
  canStartStepByOrder,
  canStepTransition,
  canTransition,
  checkStepAssignees,
  generateExecutionCode,
  hasScope,
  normalizeExecutionCreate,
  photoRequired,
  type Permission,
} from '@giangdc-sop/domain';
import type {
  AssignStepBody,
  CreateExecutionBody,
  ExecutionDto,
  ExecutionState,
  RejectApprovalBody,
} from '@giangdc-sop/contracts';
import {
  addExecutionReview,
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
import {
  countPendingApprovalsFor,
  countUnreadNotifications,
  createNotification,
  listNotifications,
  listSeniorApproverIds,
  markNotificationRead,
  toNotificationDto,
} from './notifications.js';
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

/** Kết quả kiểm tra người được gán (dùng chung cho tạo lượt và phân công bước). */
type AssigneeCheckResult = { ok: true } | { ok: false; code: string; message: string };

/**
 * Kiểm tra user tồn tại/đang hoạt động + khớp chức vụ của bước (D-09/D-12/D-14).
 * need.*Names dùng để báo lỗi thân thiện.
 */
async function checkAssignees(
  db: D1Database,
  need: { performerIds: string[]; performerNames: string; supervisorIds: string[]; supervisorNames: string },
  performerUserId: string,
  supervisorUserId: string | null | undefined,
  stepCode: string,
): Promise<AssigneeCheckResult> {
  const performer = await findActiveUser(db, performerUserId);
  if (!performer) {
    return { ok: false, code: 'UNKNOWN_USER', message: `Người thực hiện không tồn tại/không hoạt động: ${performerUserId}.` };
  }
  let supervisor: { id: string; display_name: string } | null = null;
  if (supervisorUserId) {
    supervisor = await findActiveUser(db, supervisorUserId);
    if (!supervisor) {
      return { ok: false, code: 'UNKNOWN_USER', message: `Người giám sát không tồn tại/không hoạt động: ${supervisorUserId}.` };
    }
  }
  const performerPos = await getUserPositionIds(db, performerUserId);
  const supervisorPos = supervisor ? await getUserPositionIds(db, supervisor.id) : null;
  const check = checkStepAssignees(need.performerIds, need.supervisorIds, performerPos, supervisorPos);
  if (!check.performerOk) {
    return {
      ok: false,
      code: 'ASSIGNEE_POSITION_MISMATCH',
      message: `Người thực hiện bước ${stepCode} phải giữ chức vụ: ${need.performerNames || '—'}.`,
    };
  }
  if (supervisor && !check.supervisorOk) {
    return {
      ok: false,
      code: 'ASSIGNEE_POSITION_MISMATCH',
      message: `Người giám sát bước ${stepCode} phải giữ chức vụ: ${need.supervisorNames || '—'}.`,
    };
  }
  return { ok: true };
}

/** Kiểm tra user id (nếu có) tồn tại và đang hoạt động — dùng cho createdBy/mainPerformer/supervisor. */
async function checkOptionalUser(
  db: D1Database,
  userId: string | null,
  label: string,
): Promise<AssigneeCheckResult> {
  if (!userId) return { ok: true };
  const u = await findActiveUser(db, userId);
  return u
    ? { ok: true }
    : { ok: false, code: 'UNKNOWN_USER', message: `${label} không tồn tại/không hoạt động: ${userId}.` };
}

/** POST /executions — tạo lượt từ bản ACTIVE (D-14: form đơn giản; BR-014: Idempotency-Key bắt buộc). */
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
    // D-14: chuẩn hóa trường mới (ngày mặc định hôm nay, người tạo mặc định người gọi).
    const todayYmd = new Date().toISOString().slice(0, 10);
    const normalized = normalizeExecutionCreate(body, session.user_id, todayYmd);
    if (!normalized.ok) {
      return { status: 400, body: errorBody(normalized.code, normalized.message, requestId) };
    }
    const n = normalized.value;
    for (const [uid, label] of [
      [n.createdBy, 'Người tạo'],
      [n.mainPerformerId, 'Người thực hiện chính'],
      [n.supervisorId, 'Người giám sát'],
    ] as const) {
      const uc = await checkOptionalUser(db, uid, label);
      if (!uc.ok) return { status: 400, body: errorBody(uc.code, uc.message, requestId) };
    }
    // D-14: assignments KHÔNG bắt buộc — bước thiếu gán = "chưa phân công" (NULL).
    const assignments = body.assignments ?? [];
    const stepById = new Map(versionSteps.map((s) => [s.id, s]));
    const assignByStepId = new Map<string, (typeof assignments)[number]>();
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
      const check = await checkAssignees(
        db,
        {
          performerIds: step.performerPositions.map((p) => p.id),
          performerNames: step.performerPositions.map((p) => p.name).join(', '),
          supervisorIds: step.supervisorPositions.map((p) => p.id),
          supervisorNames: step.supervisorPositions.map((p) => p.name).join(', '),
        },
        a.performerUserId,
        a.supervisorUserId ?? null,
        step.code,
      );
      if (!check.ok) {
        return { status: 400, body: errorBody(check.code, check.message, requestId) };
      }
      assignByStepId.set(a.stepId, a);
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
    // D-14: snapshot TOÀN BỘ bước của bản; bước thiếu gán = NULL ("chưa phân công").
    const stepInserts = versionSteps.map((step) => {
      const a = assignByStepId.get(step.id);
      return db.prepare(
        `INSERT INTO execution_steps
           (id, execution_id, version_step_id, step_code, title, sort_order, state, required,
            performer_user_id, supervisor_user_id, completion_json, skip_json)
         VALUES (?1,?2,?3,?4,?5,?6,'PENDING',?7,?8,?9,?10,?11)`,
      ).bind(
        newId(), executionId, step.id, step.code, step.title, step.sortOrder,
        step.required ? 1 : 0, a?.performerUserId ?? null, a?.supervisorUserId ?? null,
        JSON.stringify(step.completion ?? []),
        JSON.stringify(step.skip ?? { allowed: false, allowedPositions: [], reasonRequired: true, approvalLevel: null }),
      );
    });
    await db.batch([
      db.prepare(
        `INSERT INTO executions (id, code, process_id, version_id, state, org_unit_id, note,
           title, execution_date, execution_time, shift, main_performer_id, supervisor_id,
           created_by, created_at, updated_at)
         VALUES (?1,?2,?3,?4,'CREATED',?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14)`,
      ).bind(
        executionId, code, version.processId, version.id,
        orgUnitId, body.note?.trim() || null,
        n.title, n.executionDate, n.executionTime, n.shift,
        n.mainPerformerId, n.supervisorId,
        n.createdBy, now,
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

/**
 * POST /executions/:id/steps/:stepId/assign — phân công người cho bước (D-14).
 * Dùng sau khi tạo lượt (bước "chưa phân công"). Tái kiểm tra chức vụ như lúc tạo.
 * Quyền execution.operate (như start/complete); Idempotency-Key bắt buộc.
 */
executionApp.post(
  '/executions/:id/steps/:stepId/assign',
  requireAuth,
  requirePermission('execution.operate' as Permission),
  async (c) => {
    const body = await parseJson<AssignStepBody>(c);
    return withIdempotency(c, 'execution.step.assign', body, async () => {
      const requestId = c.get('requestId') as string;
      const session = c.get('session') as AuthSession;
      const db = c.env.DB;
      const row = await findExecution(db, c.req.param('id'));
      if (!row) {
        return { status: 404, body: errorBody('NOT_FOUND', 'Không tìm thấy lượt thực hiện.', requestId) };
      }
      const scopeCheck = await checkExecutionScope(c, row.org_unit_id, row.id);
      if (!scopeCheck.ok) return { status: 403, body: scopeCheck.response };
      if (row.state === 'COMPLETED' || row.state === 'CANCELLED') {
        return { status: 409, body: errorBody('EXECUTION_STATE_INVALID', `Lượt ở trạng thái ${row.state}, không thể phân công.`, requestId) };
      }
      const step = await findExecutionStep(db, row.id, c.req.param('stepId'));
      if (!step) {
        return { status: 404, body: errorBody('STEP_NOT_FOUND', 'Không tìm thấy bước trong lượt này.', requestId) };
      }
      if (step.state === 'DONE') {
        return { status: 409, body: errorBody('STEP_STATE_INVALID', 'Bước đã hoàn thành, không thể đổi người được gán.', requestId) };
      }
      if (!body || !body.performerUserId) {
        return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu performerUserId.', requestId) };
      }
      // Yêu cầu chức vụ lấy từ bản quy trình (khớp theo step_code).
      const versionSteps = await getVersionSteps(db, row.version_id);
      const vStep = versionSteps.find((s) => s.code === step.step_code);
      const check = await checkAssignees(
        db,
        {
          performerIds: vStep?.performerPositions.map((p) => p.id) ?? [],
          performerNames: vStep?.performerPositions.map((p) => p.name).join(', ') ?? '',
          supervisorIds: vStep?.supervisorPositions.map((p) => p.id) ?? [],
          supervisorNames: vStep?.supervisorPositions.map((p) => p.name).join(', ') ?? '',
        },
        body.performerUserId,
        body.supervisorUserId ?? null,
        step.step_code,
      );
      if (!check.ok) {
        return { status: 400, body: errorBody(check.code, check.message, requestId) };
      }
      await db.prepare(
        `UPDATE execution_steps SET performer_user_id = ?1, supervisor_user_id = ?2 WHERE id = ?3`,
      ).bind(body.performerUserId, body.supervisorUserId ?? null, step.id).run();
      await writeAudit(db, {
        id: newId(), actorId: session.user_id, action: 'execution.step_assign',
        objectType: 'execution_step', objectId: step.id,
        reason: `${row.code}/${step.step_code} → ${body.performerUserId}`, requestId,
      });
      // D-15: thông báo 2 chiều — báo cho người được phân công (trừ khi tự gán cho mình).
      if (body.performerUserId !== session.user_id) {
        await createNotification(
          db, body.performerUserId, 'step.assigned',
          `Bạn được phân công bước ${step.step_code} — ${step.title}`,
          `Lượt ${row.code}`,
          'execution', row.id,
        );
      }
      const updated = await findExecutionStep(db, row.id, step.id);
      const evRows = updated ? await listEvidenceForSteps(db, [updated.id]) : [];
      return {
        status: 200,
        body: { step: updated ? toExecutionStepDto(updated, evRows.map(toEvidenceDto)) : null },
      };
    });
  },
);

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

/** GET /executions/pending-approval-count — số lượt chờ duyệt mà tôi được duyệt (D-15, badge menu). */
executionApp.get(
  '/executions/pending-approval-count',
  requireAuth,
  requirePermission('execution.view' as Permission),
  async (c) => {
    const session = c.get('session') as AuthSession;
    const senior = (c.get('seniorApprover') as boolean) === true;
    const count = await countPendingApprovalsFor(c.env.DB, session.user_id, senior);
    return c.json({ count });
  },
);

/** GET /notifications — thông báo của tôi (D-15, chưa đọc trước). */
executionApp.get('/notifications', requireAuth, async (c) => {
  const session = c.get('session') as AuthSession;
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '50', 10) || 50, 1), 200);
  const rows = await listNotifications(c.env.DB, session.user_id, limit);
  return c.json({ items: rows.map(toNotificationDto) });
});

/** GET /notifications/unread-count — số thông báo chưa đọc (D-15, badge chuông). */
executionApp.get('/notifications/unread-count', requireAuth, async (c) => {
  const session = c.get('session') as AuthSession;
  const count = await countUnreadNotifications(c.env.DB, session.user_id);
  return c.json({ count });
});

/** POST /notifications/:id/read — đánh dấu đã đọc (D-15). */
executionApp.post('/notifications/:id/read', requireAuth, async (c) => {
  const session = c.get('session') as AuthSession;
  const ok = await markNotificationRead(c.env.DB, session.user_id, c.req.param('id'));
  return c.json({ ok });
});

/** GET /executions/:id — chi tiết kèm bước + bằng chứng. */
executionApp.get('/executions/:id', requireAuth, requirePermission('execution.view' as Permission), async (c) => {  const requestId = c.get('requestId') as string;
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

/** POST /executions/:id/steps/:stepId/start — bắt đầu bước (D-16: chỉ khi lượt Đang thực hiện + bước tuần tự). */
executionApp.post(
  '/executions/:id/steps/:stepId/start',
  requireAuth,
  requirePermission('execution.operate' as Permission),
  async (c) => {
    const loaded = await loadStepOp(c, { executionId: c.req.param('id'), stepId: c.req.param('stepId') });
    if ('error' in loaded) return loaded.error;
    const { row, step, session, requestId } = loaded;
    if (row.state !== 'IN_PROGRESS') {
      return c.json(errorBody('EXECUTION_STATE_INVALID', `Lượt ở trạng thái ${row.state}, chỉ bắt đầu bước khi lượt đang thực hiện.`, requestId), 409);
    }
    if (!canStepTransition(step.state as 'PENDING', 'IN_PROGRESS')) {
      return c.json(errorBody('STEP_STATE_INVALID', `Bước đang ở trạng thái ${step.state}.`, requestId), 409);
    }
    // D-16: bước làm tuần tự — chỉ mở khi mọi bước trước đã DONE.
    const allSteps = await getExecutionSteps(c.env.DB, row.id);
    if (!canStartStepByOrder(allSteps.map((s) => ({ sortOrder: s.sort_order, state: s.state })), step.sort_order)) {
      return c.json(errorBody('STEP_OUT_OF_ORDER', 'Phải hoàn thành các bước trước theo thứ tự.', requestId), 409);
    }
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE execution_steps SET state = 'IN_PROGRESS', started_at = ?1 WHERE id = ?2`,
    ).bind(now, step.id).run();
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'execution.step_start',
      objectType: 'execution_step', objectId: step.id, reason: `${row.code}/${step.step_code}`, requestId,
    });
    const updated = await findExecutionStep(c.env.DB, row.id, step.id);
    return c.json({ step: updated ? toExecutionStepDto(updated, []) : null, executionState: row.state });
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

/* ---------- Chuyển trạng thái lượt + duyệt (D-15) ---------- */

type ExecutionRowLite = { id: string; code: string; state: string };

/**
 * Chuyển trạng thái lượt: kiểm tra canTransition (domain), UPDATE state,
 * ghi audit, trả DTO mới. Dùng trong withIdempotency.
 */
async function doTransition(
  db: D1Database,
  row: ExecutionRowLite,
  session: AuthSession,
  requestId: string,
  to: 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'PENDING_APPROVAL' | 'APPROVED',
  auditAction: string,
  extra?: { setSql: string; binds: unknown[] },
): Promise<{ status: number; body: unknown }> {
  if (!canTransition(row.state as ExecutionState, to)) {
    return {
      status: 409,
      body: errorBody(
        'EXECUTION_STATE_INVALID',
        `Lượt ở trạng thái ${row.state}, không thể chuyển sang ${to}.`,
        requestId,
      ),
    };
  }
  const now = new Date().toISOString();
  let sql = 'UPDATE executions SET state = ?1, updated_at = ?2';
  const binds: unknown[] = [to, now];
  if (extra) {
    sql += `, ${extra.setSql}`;
    binds.push(...extra.binds);
  }
  sql += ` WHERE id = ?${binds.length + 1}`;
  binds.push(row.id);
  await db.prepare(sql).bind(...binds).run();
  await writeAudit(db, {
    id: newId(), actorId: session.user_id, action: auditAction,
    objectType: 'execution', objectId: row.id,
    reason: `${row.code}: ${row.state} -> ${to}`, requestId,
  });
  const updated = await findExecution(db, row.id);
  return { status: 200, body: { execution: updated ? await toExecutionDto(db, updated) : null } };
}

/** Nạp lượt + kiểm tra scope; trả { row } hoặc { status, body } lỗi. */
async function loadExecutionForTransition(
  c: {
    env: { DB: D1Database };
    get(key: string): unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json(body: any, status?: number): Response;
    req: { param(name: string): string };
  },
  requestId: string,
): Promise<
  | { row: ExecutionRowLite & { org_unit_id: string | null; supervisor_id: string | null; created_by: string; approval_requested_by: string | null } }
  | { status: number; body: unknown }
> {
  const db = c.env.DB;
  const row = await findExecution(db, c.req.param('id'));
  if (!row) {
    return { status: 404, body: errorBody('NOT_FOUND', 'Không tìm thấy lượt thực hiện.', requestId) };
  }
  const scopeCheck = await checkExecutionScope(c, row.org_unit_id, row.id);
  if (!scopeCheck.ok) return { status: 403, body: scopeCheck.response };
  return { row };
}

/** POST /executions/:id/start — bắt đầu lượt (CREATED -> IN_PROGRESS). */
executionApp.post(
  '/executions/:id/start',
  requireAuth,
  requirePermission('execution.operate' as Permission),
  async (c) => {
    return withIdempotency(c, 'execution.start', {}, async () => {
      const requestId = c.get('requestId') as string;
      const session = c.get('session') as AuthSession;
      const loaded = await loadExecutionForTransition(c, requestId);
      if ('status' in loaded) return loaded;
      // D-18: lưu thời điểm bắt đầu để hiện "Bắt đầu lúc".
      return doTransition(c.env.DB, loaded.row, session, requestId, 'IN_PROGRESS', 'execution.start', {
        setSql: 'started_at = ?3',
        binds: [new Date().toISOString()],
      });
    });
  },
);

/** POST /executions/:id/pause — tạm dừng lượt (IN_PROGRESS -> PAUSED). */
executionApp.post(
  '/executions/:id/pause',
  requireAuth,
  requirePermission('execution.operate' as Permission),
  async (c) => {
    return withIdempotency(c, 'execution.pause', {}, async () => {
      const requestId = c.get('requestId') as string;
      const session = c.get('session') as AuthSession;
      const loaded = await loadExecutionForTransition(c, requestId);
      if ('status' in loaded) return loaded;
      return doTransition(c.env.DB, loaded.row, session, requestId, 'PAUSED', 'execution.pause');
    });
  },
);

/** POST /executions/:id/resume — tiếp tục lượt (PAUSED -> IN_PROGRESS). */
executionApp.post(
  '/executions/:id/resume',
  requireAuth,
  requirePermission('execution.operate' as Permission),
  async (c) => {
    return withIdempotency(c, 'execution.resume', {}, async () => {
      const requestId = c.get('requestId') as string;
      const session = c.get('session') as AuthSession;
      const loaded = await loadExecutionForTransition(c, requestId);
      if ('status' in loaded) return loaded;
      return doTransition(c.env.DB, loaded.row, session, requestId, 'IN_PROGRESS', 'execution.resume');
    });
  },
);

/** POST /executions/:id/submit — báo hoàn thành (D-16: IN_PROGRESS -> PENDING_APPROVAL; giữ COMPLETED cho tương thích cũ). */
executionApp.post('/executions/:id/submit', requireAuth, async (c) => {
  return withIdempotency(c, 'execution.submit', {}, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const permissions = new Set((c.get('permissions') ?? []) as string[]);
    const loaded = await loadExecutionForTransition(c, requestId);
    if ('status' in loaded) return loaded;
    const { row } = loaded;
    // Quyền: người tạo lượt hoặc có execution.operate.
    if (row.created_by !== session.user_id && !permissions.has('execution.operate')) {
      return { status: 403, body: errorBody('FORBIDDEN', 'Chỉ người tạo lượt mới được báo hoàn thành.', requestId) };
    }
    // D-16: báo hoàn thành yêu cầu mọi bước bắt buộc đã DONE (logic chuyển từ /complete cũ).
    const steps = await getExecutionSteps(c.env.DB, row.id);
    if (!allRequiredStepsDone(steps.map((s) => ({ required: s.required === 1, state: s.state as 'PENDING' | 'IN_PROGRESS' | 'DONE' })))) {
      return { status: 400, body: errorBody('STEPS_INCOMPLETE', 'Còn bước bắt buộc chưa hoàn thành.', requestId) };
    }
    const now = new Date().toISOString();
    const res = await doTransition(c.env.DB, row, session, requestId, 'PENDING_APPROVAL', 'execution.submit', {
      setSql: 'approval_requested_by = ?3, approval_requested_at = ?4, approval_note = NULL',
      binds: [session.user_id, now],
    });
    if (res.status === 200) {
      // D-18: lưu vết báo hoàn thành vào nhật ký duyệt.
      await addExecutionReview(c.env.DB, {
        executionId: row.id, action: 'submit', actorId: session.user_id,
      });
      // D-15/D-16: thông báo 2 chiều — báo cho người duyệt (supervisor; không có -> senior).
      const approverIds = row.supervisor_id
        ? [row.supervisor_id]
        : await listSeniorApproverIds(c.env.DB);
      for (const uid of approverIds) {
        if (uid === session.user_id) continue;
        await createNotification(
          c.env.DB, uid, 'execution.submitted',
          `Lượt ${row.code} đã báo hoàn thành`,
          `Người báo: ${session.display_name ?? session.username}`,
          'execution', row.id,
        );
      }
    }
    return res;
  });
});

/** POST /executions/:id/cancel-submit — hủy báo hoàn thành (D-16: PENDING_APPROVAL -> IN_PROGRESS). */
executionApp.post('/executions/:id/cancel-submit', requireAuth, async (c) => {
  return withIdempotency(c, 'execution.cancel-submit', {}, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const senior = (c.get('seniorApprover') as boolean) === true;
    const loaded = await loadExecutionForTransition(c, requestId);
    if ('status' in loaded) return loaded;
    const { row } = loaded;
    // Chỉ người đã báo hoặc senior được hủy.
    if (row.approval_requested_by !== session.user_id && !senior) {
      return { status: 403, body: errorBody('FORBIDDEN', 'Chỉ người đã báo hoàn thành mới được hủy.', requestId) };
    }
    const res = await doTransition(c.env.DB, row, session, requestId, 'IN_PROGRESS', 'execution.cancel-submit', {
      setSql: 'approval_requested_by = NULL, approval_requested_at = NULL, approval_note = NULL',
      binds: [],
    });
    if (res.status === 200) {
      // D-18: lưu vết hủy báo hoàn thành.
      await addExecutionReview(c.env.DB, {
        executionId: row.id, action: 'cancel_submit', actorId: session.user_id,
      });
    }
    return res;
  });
});

/**
 * Kiểm tra quyền duyệt lượt (D-15): là supervisor của lượt,
 * hoặc có vai trò senior_approver (D-10).
 */
function canApproveExecution(
  c: { get(key: string): unknown },
  row: { supervisor_id: string | null },
  sessionUserId: string,
): boolean {
  if (row.supervisor_id && row.supervisor_id === sessionUserId) return true;
  return (c.get('seniorApprover') as boolean) === true;
}

/** POST /executions/:id/approve — duyệt lượt (PENDING_APPROVAL -> APPROVED). */
executionApp.post('/executions/:id/approve', requireAuth, async (c) => {
  return withIdempotency(c, 'execution.approve', {}, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const loaded = await loadExecutionForTransition(c, requestId);
    if ('status' in loaded) return loaded;
    const { row } = loaded;
    if (!canApproveExecution(c, row, session.user_id)) {
      return { status: 403, body: errorBody('FORBIDDEN', 'Bạn không có quyền duyệt lượt này.', requestId) };
    }
    const now = new Date().toISOString();
    const res = await doTransition(c.env.DB, row, session, requestId, 'APPROVED', 'execution.approve', {
      setSql: 'approved_by = ?3, approved_at = ?4',
      binds: [session.user_id, now],
    });
    if (res.status === 200) {
      // D-18: lưu vết xác nhận hoàn thành.
      await addExecutionReview(c.env.DB, {
        executionId: row.id, action: 'approve', actorId: session.user_id,
      });
      // D-15/D-16: báo cho người đã báo hoàn thành (fallback người tạo).
      const target = row.approval_requested_by ?? row.created_by;
      if (target !== session.user_id) {
        await createNotification(
          c.env.DB, target, 'execution.approved',
          `Lượt ${row.code} đã được xác nhận hoàn thành`,
          `Người xác nhận: ${session.display_name ?? session.username}`,
          'execution', row.id,
        );
      }
    }
    return res;
  });
});

/** POST /executions/:id/reject — từ chối xác nhận (D-16: PENDING_APPROVAL -> IN_PROGRESS, lý do bắt buộc; D-21: mode all/steps). */
executionApp.post('/executions/:id/reject', requireAuth, async (c) => {
  const body = await parseJson<RejectApprovalBody>(c);
  return withIdempotency(c, 'execution.reject', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const loaded = await loadExecutionForTransition(c, requestId);
    if ('status' in loaded) return loaded;
    const { row } = loaded;
    if (!canApproveExecution(c, row, session.user_id)) {
      return { status: 403, body: errorBody('FORBIDDEN', 'Bạn không có quyền duyệt lượt này.', requestId) };
    }
    const reason = (body?.reason ?? '').trim();
    if (!reason) {
      return { status: 400, body: errorBody('REASON_REQUIRED', 'Từ chối xác nhận phải ghi rõ lý do.', requestId) };
    }
    // D-21: mode 'steps' — chỉ trả các bước DONE được chọn về làm lại.
    const mode = body?.mode ?? 'all';
    let stepIds: string[] | null = null;
    if (mode === 'steps') {
      const ids = Array.isArray(body?.stepIds) ? [...new Set(body.stepIds.filter((x) => typeof x === 'string'))] : [];
      if (ids.length === 0) {
        return { status: 400, body: errorBody('STEP_IDS_REQUIRED', 'Chọn ít nhất một bước cần làm lại.', requestId) };
      }
      const steps = await getExecutionSteps(c.env.DB, row.id);
      const byId = new Map(steps.map((s) => [s.id, s]));
      for (const sid of ids) {
        const st = byId.get(sid);
        if (!st) {
          return { status: 404, body: errorBody('STEP_NOT_FOUND', 'Không tìm thấy bước trong lượt.', requestId) };
        }
        if (st.state !== 'DONE') {
          return { status: 409, body: errorBody('STEP_NOT_DONE', `Bước ${st.step_code} chưa hoàn thành, không thể trả làm lại.`, requestId) };
        }
      }
      stepIds = ids;
    } else if (mode !== 'all') {
      return { status: 400, body: errorBody('INVALID_MODE', "mode phải là 'all' hoặc 'steps'.", requestId) };
    }
    const now = new Date().toISOString();
    const res = await doTransition(c.env.DB, row, session, requestId, 'IN_PROGRESS', 'execution.reject', {
      setSql: 'approved_by = ?3, approved_at = ?4, approval_note = ?5',
      binds: [session.user_id, now, reason],
    });
    if (res.status === 200) {
      // D-21: reset các bước bị trả về PENDING (giữ evidence), audit từng bước.
      if (stepIds) {
        for (const sid of stepIds) {
          await c.env.DB.prepare(
            `UPDATE execution_steps SET state = 'PENDING', started_at = NULL, completed_at = NULL WHERE id = ?1`,
          ).bind(sid).run();
          await writeAudit(c.env.DB, {
            id: newId(), actorId: session.user_id, action: 'execution.step_redo',
            objectType: 'execution_step', objectId: sid, reason, requestId,
          });
        }
      }
      // D-18: lưu vết từ chối xác nhận (kèm lý do + step_ids) vào nhật ký duyệt.
      await addExecutionReview(c.env.DB, {
        executionId: row.id, action: 'reject', actorId: session.user_id, reason, stepIds,
      });
      // D-15/D-16: báo cho người đã báo hoàn thành (fallback người tạo).
      const target = row.approval_requested_by ?? row.created_by;
      if (target !== session.user_id) {
        await createNotification(
          c.env.DB, target, 'execution.rejected',
          stepIds ? `Lượt ${row.code} bị trả lại ${stepIds.length} bước làm lại` : `Lượt ${row.code} bị từ chối xác nhận`,
          `Lý do: ${reason}`,
          'execution', row.id,
        );
      }
    }
    return res;
  });
});

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
/** D-15: MIME tài liệu cho kind=FILE (PDF/Word/Excel). */
const ALLOWED_DOC_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/msword') return 'doc';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime === 'application/vnd.ms-excel') return 'xls';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  return 'jpg';
}

/**
 * POST /executions/:id/steps/:stepId/evidence — upload bằng chứng (D-12, D-15).
 * multipart/form-data: photo=<file>, kind?=PHOTO|FILE. Lưu R2, giới hạn 5MB.
 * PHOTO: ảnh (nên nén phía client trước); FILE: PDF/Word/Excel.
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
    // D-15: PHOTO chỉ nhận ảnh; FILE nhận tài liệu PDF/Word/Excel.
    const allowed = kind === 'PHOTO' ? ALLOWED_IMAGE_MIME : ALLOWED_DOC_MIME;
    if (!allowed.has(file.type)) {
      return c.json(errorBody('INVALID_MIME', `Định dạng file không hỗ trợ: ${file.type || 'không rõ'}.`, requestId), 400);
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      return c.json(errorBody('FILE_TOO_LARGE', 'File vượt quá 5MB.', requestId), 400);
    }
    if (file.size === 0) {
      return c.json(errorBody('INVALID_REQUEST', 'File rỗng.', requestId), 400);
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
