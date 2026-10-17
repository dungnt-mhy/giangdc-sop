import { Hono } from 'hono';
import {
  canVersionTransition,
  checkVersionApproval,
  isEditableState,
  nextVersionNo,
  resolveActivation,
  validateVersionForSubmit,
  type Permission,
  type ProcessVersionState,
} from '@giangdc-sop/domain';
import type {
  ApproveVersionBody,
  CommentBody,
  CreatePositionBody,
  CreateProcessBody,
  ProcessVersionDto,
  ReorderStepsBody,
  ReleaseVersionBody,
  ReturnVersionBody,
  SubmitVersionBody,
  UpdateProcessBody,
  UpdateVersionBody,
  UpsertStepBody,
} from '@giangdc-sop/contracts';
import {
  findProcess,
  findProcessByCode,
  findStep,
  findVersion,
  getVersionSteps,
  listApprovals,
  listComments,
  listPositions,
  listProcesses,
  listVersions,
  stepBodyToColumns,
  unknownPositionIds,
  updateVersionState,
} from './processDb.js';
import { listRoles, unknownRoleCodes, writeAudit } from './db.js';
import { errorBody, requireAuth, requirePermission } from './middleware.js';
import { idempotencyPrecheck, idempotencyStore } from './idempotency.js';
import type { AppEnv, AuthSession } from './env.js';
import type { DbRole } from './db.js';

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

/**
 * Bọc mutation bắt buộc idempotent (BR-014).
 * fn chỉ chạy khi key hợp lệ và chưa có kết quả lưu; kết quả được lưu để replay.
 */
interface IdemContext {
  req: {
    header(name: string): string | undefined;
    method: string;
    path: string;
  };
  env: { DB: D1Database };
  get(key: string): unknown;
  header(name: string, value: string): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json(body: any, status?: number): Response;
}

async function withIdempotency(
  c: IdemContext,
  operation: string,
  body: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: () => Promise<{ status: number; body: any }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const db = c.env.DB;
  const key = c.req.header('Idempotency-Key');
  const rawBody = JSON.stringify(body ?? null);
  const pre = await idempotencyPrecheck(
    db,
    key ?? null,
    session.user_id,
    operation,
    c.req.method,
    c.req.path,
    rawBody,
  );
  if (pre.status === 'missing') {
    return c.json(
      errorBody('IDEMPOTENCY_KEY_REQUIRED', 'Thiếu header Idempotency-Key.', requestId),
      400,
    );
  }
  if (pre.status === 'conflict') {
    return c.json(
      errorBody('IDEMPOTENCY_CONFLICT', 'Idempotency-Key đã dùng cho yêu cầu khác.', requestId),
      409,
    );
  }
  if (pre.status === 'replay') {
    c.header('Idempotent-Replayed', 'true');
    return c.json(JSON.parse(pre.responseBody), pre.responseStatus);
  }
  const result = await fn();
  await idempotencyStore(db, key as string, session.user_id, operation, pre.fingerprint, result.status, result.body);
  return c.json(result.body, result.status);
}

export const processApp = new Hono<AppEnv>();

/* ================= Vai trò ứng dụng (D-10) ================= */

/** GET /roles — danh sách vai trò ứng dụng (đã đăng nhập). Dùng cho select động. */
processApp.get('/roles', requireAuth, async (c) => {
  const roles = await listRoles(c.env.DB);
  return c.json({
    items: roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      seniorApprover: r.senior_approver === 1,
    })),
  });
});

/* ================= Chức vụ (D-09) ================= */

/** GET /positions — danh sách chức vụ (đã đăng nhập). */
processApp.get('/positions', requireAuth, requirePermission('process.view'), async (c) => {
  return c.json({ items: await listPositions(c.env.DB) });
});

/** POST /positions — tạo chức vụ mới (D-10: vai trò senior hoặc có user.manage;
 * giữ nguyên tắc cũ "admin/manager được tạo", nay diễn đạt bằng senior_approver). */
processApp.post('/positions', requireAuth, async (c) => {
  const requestId = c.get('requestId') as string;
  const permissions = new Set((c.get('permissions') ?? []) as string[]);
  const seniorApprover = c.get('seniorApprover') === true;
  if (!seniorApprover && !permissions.has('user.manage')) {
    return c.json(errorBody('FORBIDDEN', 'Chỉ vai trò quản trị/quản lý được tạo chức vụ.', requestId), 403);
  }
  const body = await parseJson<CreatePositionBody>(c);
  if (!body || !body.code?.trim() || !body.name?.trim()) {
    return c.json(errorBody('INVALID_REQUEST', 'Thiếu mã hoặc tên chức vụ.', requestId), 400);
  }
  const code = body.code.trim().toUpperCase();
  const dup = await c.env.DB.prepare('SELECT id FROM positions WHERE code = ?1').bind(code).first();
  if (dup) {
    return c.json(errorBody('POSITION_CODE_EXISTS', `Mã chức vụ "${code}" đã tồn tại.`, requestId), 409);
  }
  const id = newId();
  await c.env.DB.prepare('INSERT INTO positions (id, code, name) VALUES (?1, ?2, ?3)')
    .bind(id, code, body.name.trim())
    .run();
  return c.json({ position: { id, code, name: body.name.trim() } }, 201);
});

/* ================= Catalog (PRC-001/002) ================= */

/** GET /processes — tìm kiếm/lọc (PRC-002). */
processApp.get('/processes', requireAuth, requirePermission('process.view'), async (c) => {
  const items = await listProcesses(
    c.env.DB,
    {
      q: c.req.query('q') || undefined,
      group: c.req.query('group') || undefined,
      status: c.req.query('status') || undefined,
      orgUnitId: c.req.query('orgUnitId') || undefined,
    },
    Math.min(parseInt(c.req.query('limit') || '20', 10) || 20, 100),
    parseInt(c.req.query('offset') || '0', 10) || 0,
  );
  return c.json(items);
});

/** POST /processes — tạo quy trình + bản nháp đầu (PRC-001). Idempotent. */
processApp.post('/processes', requireAuth, requirePermission('process.create'), async (c) => {
  const body = await parseJson<CreateProcessBody>(c);
  return withIdempotency(c, 'process.create', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    if (!body || !body.code?.trim() || !body.name?.trim()) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu mã hoặc tên quy trình.', requestId) };
    }
    const code = body.code.trim().toUpperCase();
    if (await findProcessByCode(c.env.DB, code)) {
      return { status: 409, body: errorBody('PROCESS_CODE_EXISTS', `Mã quy trình "${code}" đã tồn tại (BR-001).`, requestId) };
    }
    const processId = newId();
    const versionId = newId();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO processes (id, code, name, purpose, scope, applicable_to, start_condition,
          end_condition, owner_id, org_unit_id, review_trigger, process_group, created_by)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`,
      ).bind(
        processId, code, body.name.trim(),
        body.purpose?.trim() || null, body.scope?.trim() || null,
        body.applicableTo?.trim() || null, body.startCondition?.trim() || null,
        body.endCondition?.trim() || null, body.ownerId || null,
        body.orgUnitId || null, body.reviewTrigger?.trim() || null,
        body.processGroup?.trim() || 'GENERAL', session.user_id,
      ),
      c.env.DB.prepare(
        `INSERT INTO process_versions (id, process_id, version_no, state, created_by)
         VALUES (?1, ?2, 1, 'DRAFT', ?3)`,
      ).bind(versionId, processId, session.user_id),
    ]);
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'process.create',
      objectType: 'process', objectId: processId, requestId,
    });
    const process = await findProcess(c.env.DB, processId);
    const version = await findVersion(c.env.DB, versionId);
    return { status: 201, body: { process, version } };
  });
});

/** GET /processes/:id — chi tiết. */
processApp.get('/processes/:id', requireAuth, requirePermission('process.view'), async (c) => {
  const requestId = c.get('requestId') as string;
  const process = await findProcess(c.env.DB, c.req.param('id'));
  if (!process) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy quy trình.', requestId), 404);
  }
  return c.json({ process });
});

/** PATCH /processes/:id — sửa trường catalog (mã bất biến, BR-001). */
processApp.patch('/processes/:id', requireAuth, requirePermission('process.edit'), async (c) => {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const body = await parseJson<UpdateProcessBody>(c);
  const process = await findProcess(c.env.DB, c.req.param('id'));
  if (!process) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy quy trình.', requestId), 404);
  }
  if (!body) {
    return c.json(errorBody('INVALID_REQUEST', 'Yêu cầu không hợp lệ.', requestId), 400);
  }
  const sets: string[] = ["updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"];
  const binds: unknown[] = [];
  const map: Record<string, string> = {
    name: 'name', purpose: 'purpose', scope: 'scope', applicableTo: 'applicable_to',
    startCondition: 'start_condition', endCondition: 'end_condition', ownerId: 'owner_id',
    orgUnitId: 'org_unit_id', reviewTrigger: 'review_trigger', processGroup: 'process_group',
  };
  for (const [jsonKey, col] of Object.entries(map)) {
    const v = (body as Record<string, unknown>)[jsonKey];
    if (v !== undefined) {
      sets.push(`${col} = ?`);
      binds.push(typeof v === 'string' ? v.trim() || null : v);
    }
  }
  if (binds.length > 0) {
    await c.env.DB.prepare(`UPDATE processes SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...binds, process.id)
      .run();
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'process.update',
      objectType: 'process', objectId: process.id, requestId,
    });
  }
  return c.json({ process: await findProcess(c.env.DB, process.id) });
});

/** POST /processes/:id/archive — lưu trữ thay vì xóa vật lý (BR-002). */
processApp.post('/processes/:id/archive', requireAuth, requirePermission('process.deprecate'), async (c) => {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const process = await findProcess(c.env.DB, c.req.param('id'));
  if (!process) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy quy trình.', requestId), 404);
  }
  await c.env.DB.prepare("UPDATE processes SET status = 'ARCHIVED' WHERE id = ?1").bind(process.id).run();
  await writeAudit(c.env.DB, {
    id: newId(), actorId: session.user_id, action: 'process.archive',
    objectType: 'process', objectId: process.id, requestId,
  });
  return c.json({ process: await findProcess(c.env.DB, process.id) });
});

/* ================= Versions ================= */

/** GET /processes/:id/versions — liệt kê phiên bản. */
processApp.get('/processes/:id/versions', requireAuth, requirePermission('process.view'), async (c) => {
  const requestId = c.get('requestId') as string;
  const process = await findProcess(c.env.DB, c.req.param('id'));
  if (!process) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy quy trình.', requestId), 404);
  }
  return c.json({ versions: await listVersions(c.env.DB, process.id) });
});

/** POST /processes/:id/versions — tạo phiên bản kế tiếp bằng copy bản gần nhất (PRC-003). */
processApp.post('/processes/:id/versions', requireAuth, requirePermission('process.edit'), async (c) => {
  const body = await parseJson<Record<string, unknown>>(c);
  return withIdempotency(c, 'process.version.create', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const process = await findProcess(c.env.DB, c.req.param('id'));
    if (!process) {
      return { status: 404, body: errorBody('NOT_FOUND', 'Không tìm thấy quy trình.', requestId) };
    }
    const versions = await listVersions(c.env.DB, process.id);
    const latest = versions[0] ?? null;
    const versionId = newId();
    const stmts = [
      c.env.DB.prepare(
        `INSERT INTO process_versions (id, process_id, version_no, state, created_by)
         VALUES (?1, ?2, ?3, 'DRAFT', ?4)`,
      ).bind(versionId, process.id, nextVersionNo(versions.map((v) => v.versionNo)), session.user_id),
    ];
    if (latest) {
      const steps = await getVersionSteps(c.env.DB, latest.id);
      for (const s of steps) {
        stmts.push(
          c.env.DB.prepare(
            `INSERT INTO process_steps (id, version_id, code, title, prerequisites, inputs,
              instructions, expected_result, outputs, notes,
              performer_position_ids_json, supervisor_position_ids_json,
              required, target_duration_min, warnings, sort_order, completion_json, skip_json, failure_policy)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)`,
          ).bind(
            newId(), versionId, s.code, s.title, s.prerequisites, s.inputs,
            s.instructions, s.expectedResult, s.outputs, s.notes,
            JSON.stringify((s.performerPositions ?? []).map((p) => p.id)),
            JSON.stringify((s.supervisorPositions ?? []).map((p) => p.id)),
            s.required ? 1 : 0, s.targetDurationMin, s.warnings, s.sortOrder,
            JSON.stringify(s.completion), JSON.stringify(s.skip), s.failurePolicy,
          ),
        );
      }
    }
    await c.env.DB.batch(stmts);
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'process.version.create',
      objectType: 'process_version', objectId: versionId, requestId,
    });
    return { status: 201, body: { version: await findVersion(c.env.DB, versionId) } };
  });
});

/** GET /versions/:versionId — chi tiết phiên bản + bước. */
processApp.get('/versions/:versionId', requireAuth, requirePermission('process.view'), async (c) => {
  const requestId = c.get('requestId') as string;
  const version = await findVersion(c.env.DB, c.req.param('versionId'));
  if (!version) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId), 404);
  }
  const steps = await getVersionSteps(c.env.DB, version.id);
  const comments = await listComments(c.env.DB, version.id);
  const approvals = await listApprovals(c.env.DB, version.id);
  return c.json({ version, steps, comments, approvals });
});

/** PATCH /versions/:versionId — sửa trường bản nháp (chỉ DRAFT, GOV-001). */
processApp.patch('/versions/:versionId', requireAuth, requirePermission('process.edit'), async (c) => {
  const requestId = c.get('requestId') as string;
  const body = await parseJson<UpdateVersionBody>(c);
  const version = await findVersion(c.env.DB, c.req.param('versionId'));
  if (!version) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId), 404);
  }
  if (!isEditableState(version.state)) {
    return c.json(errorBody('VERSION_LOCKED', 'Phiên bản đã khóa sửa từ IN_REVIEW (GOV-001, AC-02).', requestId), 409);
  }
  if (!body || typeof body.expectedRevision !== 'number') {
    return c.json(errorBody('INVALID_REQUEST', 'Thiếu expectedRevision.', requestId), 400);
  }
  const ok = await updateVersionState(
    c.env.DB,
    version.id,
    {
      changeSummary: body.changeSummary,
      changeSize: body.changeSize,
      impactAssessment: body.impactAssessment,
    },
    body.expectedRevision,
  );
  if (!ok) {
    return c.json(errorBody('CONCURRENT_MODIFICATION', 'Phiên bản đã bị thay đổi bởi người khác.', requestId), 409);
  }
  return c.json({ version: await findVersion(c.env.DB, version.id) });
});

/* ================= Steps (PRC-004/005/006/007/008) ================= */

async function requireDraftVersion(c: { req: { param(n: string): string }; env: { DB: D1Database } }, requestId: string) {
  const version = await findVersion(c.env.DB, c.req.param('versionId'));
  if (!version) return { error: { status: 404, body: errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId) } };
  if (!isEditableState(version.state)) {
    return {
      error: {
        status: 409,
        body: errorBody('VERSION_LOCKED', 'Chỉ được sửa bước ở trạng thái DRAFT (GOV-001).', requestId),
      },
    };
  }
  return { version };
}

/** POST /versions/:versionId/steps — thêm bước (PRC-004/005). */
processApp.post('/versions/:versionId/steps', requireAuth, requirePermission('process.edit'), async (c) => {
  const requestId = c.get('requestId') as string;
  const body = await parseJson<UpsertStepBody>(c);
  const chk = await requireDraftVersion(c, requestId);
  if (chk.error) return c.json(chk.error.body, chk.error.status as 200);
  const version = chk.version as ProcessVersionDto;
  if (!body || !body.code?.trim() || !body.title?.trim()) {
    return c.json(errorBody('INVALID_REQUEST', 'Bước phải có mã và tiêu đề hành động.', requestId), 400);
  }
  // D-09: id chức vụ phải tồn tại trong bảng positions.
  const unknown = await unknownPositionIds(c.env.DB, [
    ...(body.performerPositionIds ?? []),
    ...(body.supervisorPositionIds ?? []),
  ]);
  if (unknown.length > 0) {
    return c.json(errorBody('UNKNOWN_POSITION', `Chức vụ không tồn tại: ${unknown.join(', ')}.`, requestId), 400);
  }
  // D-10: mã vai trò được bỏ qua phải tồn tại trong bảng roles.
  const unknownRoles = await unknownRoleCodes(c.env.DB, body.skip?.allowedRoles ?? []);
  if (unknownRoles.length > 0) {
    return c.json(errorBody('UNKNOWN_ROLE', `Vai trò không tồn tại: ${unknownRoles.join(', ')}.`, requestId), 400);
  }
  const existing = await getVersionSteps(c.env.DB, version.id);
  if (existing.some((s) => s.code === body.code.trim())) {
    return c.json(errorBody('STEP_CODE_EXISTS', `Mã bước "${body.code.trim()}" đã tồn tại.`, requestId), 409);
  }
  const cols = stepBodyToColumns(body);
  const stepId = newId();
  const maxOrder = existing.reduce((m, s) => Math.max(m, s.sortOrder), 0);
  await c.env.DB.prepare(
    `INSERT INTO process_steps (id, version_id, code, title, prerequisites, inputs, instructions,
      expected_result, outputs, notes, performer_position_ids_json, supervisor_position_ids_json,
      required, target_duration_min, warnings, sort_order, completion_json, skip_json, failure_policy)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)`,
  )
    .bind(
      stepId, version.id, cols.code, cols.title, cols.prerequisites, cols.inputs,
      cols.instructions, cols.expected_result, cols.outputs, cols.notes,
      cols.performer_position_ids_json, cols.supervisor_position_ids_json,
      cols.required, cols.target_duration_min, cols.warnings, maxOrder + 1,
      cols.completion_json, cols.skip_json, cols.failure_policy,
    )
    .run();
  return c.json({ step: await findStep(c.env.DB, stepId) }, 201);
});

/** PATCH /versions/:versionId/steps/:stepId — sửa bước. */
processApp.patch(
  '/versions/:versionId/steps/:stepId',
  requireAuth,
  requirePermission('process.edit'),
  async (c) => {
    const requestId = c.get('requestId') as string;
    const body = await parseJson<UpsertStepBody>(c);
    const chk = await requireDraftVersion(c, requestId);
    if (chk.error) return c.json(chk.error.body, chk.error.status as 200);
    const version = chk.version as ProcessVersionDto;
    const step = await findStep(c.env.DB, c.req.param('stepId'));
    if (!step || step.versionId !== version.id) {
      return c.json(errorBody('NOT_FOUND', 'Không tìm thấy bước.', requestId), 404);
    }
    if (!body) {
      return c.json(errorBody('INVALID_REQUEST', 'Yêu cầu không hợp lệ.', requestId), 400);
    }
    const unknown = await unknownPositionIds(c.env.DB, [
      ...(body.performerPositionIds ?? []),
      ...(body.supervisorPositionIds ?? []),
    ]);
    if (unknown.length > 0) {
      return c.json(errorBody('UNKNOWN_POSITION', `Chức vụ không tồn tại: ${unknown.join(', ')}.`, requestId), 400);
    }
    // D-10: mã vai trò được bỏ qua phải tồn tại trong bảng roles.
    const unknownRoles = await unknownRoleCodes(c.env.DB, body.skip?.allowedRoles ?? []);
    if (unknownRoles.length > 0) {
      return c.json(errorBody('UNKNOWN_ROLE', `Vai trò không tồn tại: ${unknownRoles.join(', ')}.`, requestId), 400);
    }
    const cols = stepBodyToColumns({ ...body, code: body.code || step.code, title: body.title || step.title });
    if (cols.code !== step.code) {
      const existing = await getVersionSteps(c.env.DB, version.id);
      if (existing.some((s) => s.code === cols.code)) {
        return c.json(errorBody('STEP_CODE_EXISTS', `Mã bước "${cols.code}" đã tồn tại.`, requestId), 409);
      }
    }
    await c.env.DB.prepare(
      `UPDATE process_steps SET code=?2, title=?3, prerequisites=?4, inputs=?5, instructions=?6,
        expected_result=?7, outputs=?8, notes=?9,
        performer_position_ids_json=?10, supervisor_position_ids_json=?11,
        required=?12, target_duration_min=?13, warnings=?14, completion_json=?15, skip_json=?16,
        failure_policy=?17 WHERE id=?1`,
    )
      .bind(
        step.id, cols.code, cols.title, cols.prerequisites, cols.inputs, cols.instructions,
        cols.expected_result, cols.outputs, cols.notes,
        cols.performer_position_ids_json, cols.supervisor_position_ids_json, cols.required,
        cols.target_duration_min, cols.warnings, cols.completion_json, cols.skip_json,
        cols.failure_policy,
      )
      .run();
    return c.json({ step: await findStep(c.env.DB, step.id) });
  },
);

/** DELETE /versions/:versionId/steps/:stepId — xóa bước trong nháp (chưa có lịch sử). */
processApp.delete(
  '/versions/:versionId/steps/:stepId',
  requireAuth,
  requirePermission('process.edit'),
  async (c) => {
    const requestId = c.get('requestId') as string;
    const chk = await requireDraftVersion(c, requestId);
    if (chk.error) return c.json(chk.error.body, chk.error.status as 200);
    const version = chk.version as ProcessVersionDto;
    const step = await findStep(c.env.DB, c.req.param('stepId'));
    if (!step || step.versionId !== version.id) {
      return c.json(errorBody('NOT_FOUND', 'Không tìm thấy bước.', requestId), 404);
    }
    await c.env.DB.prepare('DELETE FROM process_steps WHERE id = ?1').bind(step.id).run();
    return c.json({ ok: true, deletedId: step.id });
  },
);

/** POST /versions/:versionId/steps/reorder — sắp xếp bước (PRC-004). */
processApp.post(
  '/versions/:versionId/steps/reorder',
  requireAuth,
  requirePermission('process.edit'),
  async (c) => {
    const requestId = c.get('requestId') as string;
    const body = await parseJson<ReorderStepsBody>(c);
    const chk = await requireDraftVersion(c, requestId);
    if (chk.error) return c.json(chk.error.body, chk.error.status as 200);
    const version = chk.version as ProcessVersionDto;
    const steps = await getVersionSteps(c.env.DB, version.id);
    const ids = new Set(steps.map((s) => s.id));
    if (!body || !Array.isArray(body.order) || body.order.length !== steps.length || !body.order.every((id) => ids.has(id))) {
      return c.json(errorBody('INVALID_REQUEST', 'Danh sách thứ tự phải chứa đúng tất cả bước.', requestId), 400);
    }
    await c.env.DB.batch(
      body.order.map((id, i) =>
        c.env.DB.prepare('UPDATE process_steps SET sort_order = ?2 WHERE id = ?1').bind(id, i + 1),
      ),
    );
    return c.json({ steps: await getVersionSteps(c.env.DB, version.id) });
  },
);

/* ================= Validate & governance ================= */

/** POST /versions/:versionId/validate — kiểm tra bản nháp (PRC-009). */
processApp.post('/versions/:versionId/validate', requireAuth, requirePermission('process.edit'), async (c) => {
  const requestId = c.get('requestId') as string;
  const body = await parseJson<{ changeSummary?: string; changeSize?: 'MINOR' | 'MAJOR'; impactAssessment?: string | null }>(c);
  const version = await findVersion(c.env.DB, c.req.param('versionId'));
  if (!version) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId), 404);
  }
  const steps = await getVersionSteps(c.env.DB, version.id);
  const issues = validateVersionForSubmit(
    {
      changeSummary: body?.changeSummary ?? version.changeSummary ?? '',
      changeSize: body?.changeSize ?? version.changeSize ?? 'MINOR',
      impactAssessment: body?.impactAssessment ?? version.impactAssessment ?? null,
      effectiveFrom: version.effectiveFrom,
    },
    steps.map((s) => ({
      code: s.code,
      title: s.title,
      prerequisites: s.prerequisites,
      inputs: s.inputs,
      instructions: s.instructions,
      expectedResult: s.expectedResult,
      outputs: s.outputs,
      notes: s.notes,
      performerPositionIds: (s.performerPositions ?? []).map((p) => p.id),
      supervisorPositionIds: (s.supervisorPositions ?? []).map((p) => p.id),
      required: s.required,
      targetDurationMin: s.targetDurationMin,
      warnings: s.warnings,
      completion: s.completion,
      skip: s.skip,
      failurePolicy: s.failurePolicy,
    })),
  );
  return c.json({ valid: issues.length === 0, issues });
});

/** POST /versions/:versionId/submit — gửi thẩm định, khóa sửa (GOV-001). Idempotent. */
processApp.post('/versions/:versionId/submit', requireAuth, requirePermission('process.edit'), async (c) => {
  const body = await parseJson<SubmitVersionBody>(c);
  return withIdempotency(c, 'process.version.submit', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const version = await findVersion(c.env.DB, c.req.param('versionId'));
    if (!version) {
      return { status: 404, body: errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId) };
    }
    if (version.state !== 'DRAFT') {
      return { status: 409, body: errorBody('INVALID_STATE', 'Chỉ gửi thẩm định từ DRAFT.', requestId) };
    }
    if (!body || typeof body.expectedRevision !== 'number') {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu expectedRevision.', requestId) };
    }
    const steps = await getVersionSteps(c.env.DB, version.id);
    const issues = validateVersionForSubmit(
      {
        changeSummary: body.changeSummary ?? '',
        changeSize: body.changeSize ?? 'MINOR',
        impactAssessment: body.impactAssessment ?? null,
        effectiveFrom: version.effectiveFrom,
      },
      steps.map((s) => ({
        code: s.code,
        title: s.title,
        prerequisites: s.prerequisites,
        inputs: s.inputs,
        instructions: s.instructions,
        expectedResult: s.expectedResult,
        outputs: s.outputs,
        notes: s.notes,
        performerPositionIds: (s.performerPositions ?? []).map((p) => p.id),
        supervisorPositionIds: (s.supervisorPositions ?? []).map((p) => p.id),
        required: s.required,
        targetDurationMin: s.targetDurationMin,
        warnings: s.warnings,
        completion: s.completion,
        skip: s.skip,
        failurePolicy: s.failurePolicy,
      })),
    );
    if (issues.length > 0) {
      return { status: 422, body: { ...errorBody('VALIDATION_FAILED', 'Bản nháp chưa đạt yêu cầu.', requestId), issues } };
    }
    const ok = await updateVersionState(
      c.env.DB,
      version.id,
      {
        state: 'IN_REVIEW',
        changeSummary: body.changeSummary.trim(),
        changeSize: body.changeSize ?? 'MINOR',
        impactAssessment: body.impactAssessment?.trim() || null,
      },
      body.expectedRevision,
    );
    if (!ok) {
      return { status: 409, body: errorBody('CONCURRENT_MODIFICATION', 'Phiên bản đã bị thay đổi bởi người khác.', requestId) };
    }
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'process.version.submit',
      objectType: 'process_version', objectId: version.id, requestId,
    });
    return { status: 200, body: { version: await findVersion(c.env.DB, version.id) } };
  });
});

/** POST /versions/:versionId/comments — góp ý (GOV-002). */
processApp.post('/versions/:versionId/comments', requireAuth, requirePermission('process.review'), async (c) => {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const body = await parseJson<CommentBody>(c);
  const version = await findVersion(c.env.DB, c.req.param('versionId'));
  if (!version) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId), 404);
  }
  if (!body || !body.body?.trim()) {
    return c.json(errorBody('INVALID_REQUEST', 'Thiếu nội dung góp ý.', requestId), 400);
  }
  if (body.stepId) {
    const step = await findStep(c.env.DB, body.stepId);
    if (!step || step.versionId !== version.id) {
      return c.json(errorBody('NOT_FOUND', 'Không tìm thấy bước.', requestId), 404);
    }
  }
  const id = newId();
  await c.env.DB.prepare(
    'INSERT INTO review_comments (id, version_id, step_id, author_id, body) VALUES (?1,?2,?3,?4,?5)',
  )
    .bind(id, version.id, body.stepId || null, session.user_id, body.body.trim())
    .run();
  return c.json({ comments: await listComments(c.env.DB, version.id) }, 201);
});

/** POST /versions/:versionId/return — trả sửa về DRAFT, giữ lịch sử (GOV-003). */
processApp.post('/versions/:versionId/return', requireAuth, requirePermission('process.review'), async (c) => {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const body = await parseJson<ReturnVersionBody>(c);
  const version = await findVersion(c.env.DB, c.req.param('versionId'));
  if (!version) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId), 404);
  }
  if (version.state !== 'IN_REVIEW') {
    return c.json(errorBody('INVALID_STATE', 'Chỉ trả sửa từ IN_REVIEW.', requestId), 409);
  }
  if (!body || !body.reason?.trim() || typeof body.expectedRevision !== 'number') {
    return c.json(errorBody('INVALID_REQUEST', 'Cần lý do trả sửa và expectedRevision.', requestId), 400);
  }
  if (!canVersionTransition(version.state as ProcessVersionState, 'DRAFT')) {
    return c.json(errorBody('INVALID_STATE', 'Transition không hợp lệ.', requestId), 409);
  }
  const ok = await updateVersionState(c.env.DB, version.id, { state: 'DRAFT' }, body.expectedRevision);
  if (!ok) {
    return c.json(errorBody('CONCURRENT_MODIFICATION', 'Phiên bản đã bị thay đổi bởi người khác.', requestId), 409);
  }
  await c.env.DB.prepare(
    `INSERT INTO approval_records (id, version_id, approver_id, approver_role, decision, reason)
     VALUES (?1,?2,?3,?4,'RETURNED',?5)`,
  )
    .bind(newId(), version.id, session.user_id, ((c.get('roles') ?? []) as DbRole[])[0]?.code ?? null, body.reason.trim())
    .run();
  await writeAudit(c.env.DB, {
    id: newId(), actorId: session.user_id, action: 'process.version.return',
    objectType: 'process_version', objectId: version.id, reason: body.reason.trim(), requestId,
  });
  return c.json({ version: await findVersion(c.env.DB, version.id) });
});

/** POST /versions/:versionId/approve — phê duyệt (GOV-004 + OPEN-SOD-01 + D-08). Idempotent. */
processApp.post('/versions/:versionId/approve', requireAuth, requirePermission('process.approve'), async (c) => {
  const body = await parseJson<ApproveVersionBody>(c);
  return withIdempotency(c, 'process.version.approve', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const version = await findVersion(c.env.DB, c.req.param('versionId'));
    if (!version) {
      return { status: 404, body: errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId) };
    }
    if (version.state !== 'IN_REVIEW') {
      return { status: 409, body: errorBody('INVALID_STATE', 'Chỉ phê duyệt từ IN_REVIEW.', requestId) };
    }
    if (!body || typeof body.expectedRevision !== 'number' || !body.decision) {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu decision/expectedRevision.', requestId) };
    }
    const severity = body.decision === 'APPROVED'
      ? (body.severity ?? (version.changeSize === 'MAJOR' ? 'HIGH' : 'MEDIUM'))
      : 'LOW';
    // D-10: người phê duyệt = user khác có process.approve; HIGH/BLOCKING cần cờ senior.
    const permissions = new Set((c.get('permissions') ?? []) as Permission[]);
    const seniorApprover = c.get('seniorApprover') === true;
    const roles = (c.get('roles') ?? []) as DbRole[];
    const check = checkVersionApproval({
      requesterId: version.createdBy ?? '',
      candidateId: session.user_id,
      candidatePermissions: permissions,
      candidateSenior: seniorApprover,
      severity,
    });
    if (!check.ok) {
      return {
        status: 403,
        body: errorBody(check.reason, 'Không đủ điều kiện phê duyệt (SOD/severity).', requestId),
      };
    }
    if (check.reasonRequired && !body.reason?.trim()) {
      return { status: 422, body: errorBody('REASON_REQUIRED', 'Mức HIGH/BLOCKING bắt buộc ghi lý do.', requestId) };
    }
    const target: ProcessVersionState = body.decision === 'APPROVED' ? 'APPROVED' : 'DRAFT';
    if (!canVersionTransition(version.state as ProcessVersionState, target)) {
      return { status: 409, body: errorBody('INVALID_STATE', 'Transition không hợp lệ.', requestId) };
    }
    const ok = await updateVersionState(c.env.DB, version.id, { state: target }, body.expectedRevision);
    if (!ok) {
      return { status: 409, body: errorBody('CONCURRENT_MODIFICATION', 'Phiên bản đã bị thay đổi bởi người khác.', requestId) };
    }
    await c.env.DB.prepare(
      `INSERT INTO approval_records (id, version_id, approver_id, approver_role, decision, reason, self_approved, flagged)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
    )
      .bind(
        newId(), version.id, session.user_id, roles[0]?.code ?? null, body.decision,
        body.reason?.trim() || null, check.selfApproved ? 1 : 0, check.flagged ? 1 : 0,
      )
      .run();
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'process.version.approve',
      objectType: 'process_version', objectId: version.id,
      reason: body.reason?.trim() || undefined,
      flagged: check.flagged, requestId,
    });
    return { status: 200, body: { version: await findVersion(c.env.DB, version.id) } };
  });
});

/** POST /versions/:versionId/release — phát hành ngay/theo lịch (GOV-005/GOV-006). Idempotent. */
processApp.post('/versions/:versionId/release', requireAuth, requirePermission('process.publish'), async (c) => {
  const body = await parseJson<ReleaseVersionBody>(c);
  return withIdempotency(c, 'process.version.release', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const version = await findVersion(c.env.DB, c.req.param('versionId'));
    if (!version) {
      return { status: 404, body: errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId) };
    }
    if (version.state === 'ACTIVE') {
      // Retry idempotent (AC-02): đã ACTIVE thì trả lại, không tạo thêm.
      return { status: 200, body: { version, alreadyActive: true } };
    }
    if (version.state !== 'APPROVED') {
      return { status: 409, body: errorBody('INVALID_STATE', 'Chỉ phát hành phiên bản đã phê duyệt.', requestId) };
    }
    if (!body || typeof body.expectedRevision !== 'number') {
      return { status: 400, body: errorBody('INVALID_REQUEST', 'Thiếu expectedRevision.', requestId) };
    }
    const effectiveFrom = body.effectiveFrom?.trim() || null;
    const scheduled = effectiveFrom !== null && new Date(effectiveFrom).getTime() > Date.now();
    const target: ProcessVersionState = scheduled ? 'SCHEDULED' : 'ACTIVE';
    if (!canVersionTransition('APPROVED', target)) {
      return { status: 409, body: errorBody('INVALID_STATE', 'Transition không hợp lệ.', requestId) };
    }
    // Lấy process_id để lập kế hoạch kích hoạt.
    const full = await c.env.DB.prepare('SELECT process_id FROM process_versions WHERE id = ?1')
      .bind(version.id).first<{ process_id: string }>();
    const versions = await listVersions(c.env.DB, full!.process_id);
    const plan = resolveActivation(
      versions.map((v) => ({ id: v.id, state: v.state })),
      version.id,
    );
    if (!plan.ok) {
      return { status: 409, body: errorBody('ACTIVATION_REJECTED', `Không thể kích hoạt: ${plan.reason}.`, requestId) };
    }
    const now = new Date().toISOString();
    const stmts = plan.supersede.map((id) =>
      c.env.DB.prepare("UPDATE process_versions SET state='SUPERSEDED', revision=revision+1, updated_at=?2 WHERE id=?1")
        .bind(id, now),
    );
    stmts.push(
      c.env.DB.prepare(
        'UPDATE process_versions SET state=?2, effective_from=?3, revision=revision+1, updated_at=?4 WHERE id=?1 AND revision=?5',
      ).bind(version.id, target, effectiveFrom, now, body.expectedRevision),
    );
    const results = await c.env.DB.batch(stmts);
    const last = results[results.length - 1];
    if ((last.meta.changes ?? 0) !== 1) {
      return { status: 409, body: errorBody('CONCURRENT_MODIFICATION', 'Phiên bản đã bị thay đổi bởi người khác.', requestId) };
    }
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'process.version.release',
      objectType: 'process_version', objectId: version.id, requestId,
    });
    return { status: 200, body: { version: await findVersion(c.env.DB, version.id), superseded: plan.supersede } };
  });
});

/** POST /versions/:versionId/activate — kích hoạt bản SCHEDULED (idempotent, AC-02). */
processApp.post('/versions/:versionId/activate', requireAuth, requirePermission('process.publish'), async (c) => {
  const body = await parseJson<{ expectedRevision?: number }>(c);
  return withIdempotency(c, 'process.version.activate', body, async () => {
    const requestId = c.get('requestId') as string;
    const session = c.get('session') as AuthSession;
    const version = await findVersion(c.env.DB, c.req.param('versionId'));
    if (!version) {
      return { status: 404, body: errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId) };
    }
    if (version.state === 'ACTIVE') {
      return { status: 200, body: { version, alreadyActive: true } };
    }
    if (version.state !== 'SCHEDULED') {
      return { status: 409, body: errorBody('INVALID_STATE', 'Chỉ kích hoạt bản SCHEDULED.', requestId) };
    }
    const expectedRevision = body?.expectedRevision ?? version.revision;
    const full = await c.env.DB.prepare('SELECT process_id FROM process_versions WHERE id = ?1')
      .bind(version.id).first<{ process_id: string }>();
    const versions = await listVersions(c.env.DB, full!.process_id);
    const plan = resolveActivation(versions.map((v) => ({ id: v.id, state: v.state })), version.id);
    if (!plan.ok) {
      return { status: 409, body: errorBody('ACTIVATION_REJECTED', `Không thể kích hoạt: ${plan.reason}.`, requestId) };
    }
    const now = new Date().toISOString();
    const stmts = plan.supersede.map((id) =>
      c.env.DB.prepare("UPDATE process_versions SET state='SUPERSEDED', revision=revision+1, updated_at=?2 WHERE id=?1")
        .bind(id, now),
    );
    stmts.push(
      c.env.DB.prepare(
        'UPDATE process_versions SET state=?2, revision=revision+1, updated_at=?3 WHERE id=?1 AND revision=?4',
      ).bind(version.id, 'ACTIVE', now, expectedRevision),
    );
    const results = await c.env.DB.batch(stmts);
    const last = results[results.length - 1];
    if ((last.meta.changes ?? 0) !== 1) {
      return { status: 409, body: errorBody('CONCURRENT_MODIFICATION', 'Phiên bản đã bị thay đổi bởi người khác.', requestId) };
    }
    await writeAudit(c.env.DB, {
      id: newId(), actorId: session.user_id, action: 'process.version.activate',
      objectType: 'process_version', objectId: version.id, requestId,
    });
    return { status: 200, body: { version: await findVersion(c.env.DB, version.id), superseded: plan.supersede } };
  });
});

/** POST /versions/:versionId/retire — ngừng dùng bản đã thay thế (GOV-007). */
processApp.post('/versions/:versionId/retire', requireAuth, requirePermission('process.deprecate'), async (c) => {
  const requestId = c.get('requestId') as string;
  const session = c.get('session') as AuthSession;
  const body = await parseJson<{ expectedRevision?: number }>(c);
  const version = await findVersion(c.env.DB, c.req.param('versionId'));
  if (!version) {
    return c.json(errorBody('NOT_FOUND', 'Không tìm thấy phiên bản.', requestId), 404);
  }
  if (version.state !== 'SUPERSEDED') {
    return c.json(errorBody('INVALID_STATE', 'Chỉ ngừng dùng bản SUPERSEDED (qua ACTIVE → SUPERSEDED).', requestId), 409);
  }
  const ok = await updateVersionState(
    c.env.DB, version.id, { state: 'RETIRED' }, body?.expectedRevision ?? version.revision,
  );
  if (!ok) {
    return c.json(errorBody('CONCURRENT_MODIFICATION', 'Phiên bản đã bị thay đổi bởi người khác.', requestId), 409);
  }
  await writeAudit(c.env.DB, {
    id: newId(), actorId: session.user_id, action: 'process.version.retire',
    objectType: 'process_version', objectId: version.id, requestId,
  });
  return c.json({ version: await findVersion(c.env.DB, version.id) });
});
