/**
 * Lượt thực hiện + Chụp ảnh bằng chứng (T3, D-12).
 * EXE-001..013, EVD-001..013 (phạm vi D-12).
 */
import React from 'react';
import type {
  AssignStepBody,
  CreateExecutionBody,
  EvidenceDto,
  ExecutionDto,
  ExecutionShift,
  ExecutionState,
  ExecutionStepDto,
  ExecutionStepState,
  PositionDto,
  ProcessDto,
  ProcessVersionDto,
} from '@giangdc-sop/contracts';
import { api, API_BASE } from './App.js';

const SHIFT_LABEL: Record<ExecutionShift, string> = {
  SANG: 'Sáng',
  CHIEU: 'Chiều',
  TOI: 'Tối',
};

const EXEC_STATE_LABEL: Record<ExecutionState, string> = {
  CREATED: 'Mới tạo',
  IN_PROGRESS: 'Đang thực hiện',
  PAUSED: 'Tạm dừng',
  BLOCKED: 'Bị chặn',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

const EXEC_STATE_CHIP: Record<ExecutionState, string> = {
  CREATED: '',
  IN_PROGRESS: '',
  PAUSED: 'warn',
  BLOCKED: 'warn',
  COMPLETED: 'ok',
  CANCELLED: 'muted',
};

const STEP_STATE_LABEL: Record<ExecutionStepState, string> = {
  PENDING: 'Chờ thực hiện',
  IN_PROGRESS: 'Đang thực hiện',
  DONE: 'Hoàn thành',
};

const STEP_STATE_CHIP: Record<ExecutionStepState, string> = {
  PENDING: 'muted',
  IN_PROGRESS: '',
  DONE: 'ok',
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Lỗi hệ thống.';
}

function newIdemKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** POST multipart (upload ảnh) — api() trong App.tsx ép Content-Type json nên cần riêng. */
async function apiForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
    headers: { 'Idempotency-Key': newIdemKey() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? 'Lỗi hệ thống.');
  }
  return data as T;
}

/* ---------------- Danh sách lượt ---------------- */

export function ExecutionsView({ perms, userId }: { perms: string[]; userId: string }) {
  const [items, setItems] = React.useState<ExecutionDto[]>([]);
  const [mineOnly, setMineOnly] = React.useState(true);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const canCreate = perms.includes('execution.create');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = (await api(`/executions${mineOnly ? '?mine=1' : ''}`)) as { items: ExecutionDto[] };
      setItems(d.items ?? []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [mineOnly]);

  React.useEffect(() => { load(); }, [load]);

  if (detailId) {
    return (
      <ExecutionDetail
        executionId={detailId}
        userId={userId}
        perms={perms}
        onBack={() => { setDetailId(null); load(); }}
      />
    );
  }

  return (
    <div>
      <div className="sec-head">
        <h3>Lượt thực hiện</h3>
        {canCreate && (
          <button type="button" className="btn-small primary" onClick={() => setShowCreate(true)}>
            + Tạo lượt
          </button>
        )}
      </div>
      <div className="filter-row">
        <button
          type="button"
          className={`btn-small${mineOnly ? ' primary' : ''}`}
          onClick={() => setMineOnly(true)}
        >
          Của tôi
        </button>
        <button
          type="button"
          className={`btn-small${!mineOnly ? ' primary' : ''}`}
          onClick={() => setMineOnly(false)}
        >
          Tất cả
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {loading ? (
        <div className="empty">Đang tải…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          {mineOnly ? 'Chưa có lượt nào gán cho bạn.' : 'Chưa có lượt thực hiện nào.'}
        </div>
      ) : (
        <div className="exec-list">
          {items.map((ex) => {
            const done = ex.steps.filter((s) => s.state === 'DONE').length;
            const total = ex.steps.length;
            return (
              <button
                type="button"
                key={ex.id}
                className="exec-card"
                onClick={() => setDetailId(ex.id)}
              >
                <div className="exec-card-head">
                  <code>{ex.code}</code>
                  <span className={`chip sm ${EXEC_STATE_CHIP[ex.state]}`}>
                    {EXEC_STATE_LABEL[ex.state]}
                  </span>
                </div>
                <div className="exec-card-title">
                  {ex.title ? <>{ex.title} <span className="muted">· {ex.processName}</span></> : ex.processName}
                  {' '}— Bản v{ex.versionNo}
                </div>
                <div className="exec-progress">
                  <div className="exec-progress-bar">
                    <div
                      className="exec-progress-fill"
                      style={{ width: total > 0 ? `${Math.round((done / total) * 100)}%` : '0%' }}
                    />
                  </div>
                  <span className="muted">{done}/{total} bước</span>
                </div>
                <div className="exec-card-meta muted">
                  {ex.createdByName ?? ''} · {new Date(ex.createdAt).toLocaleDateString('vi-VN')}
                  {ex.orgUnitName ? ` · ${ex.orgUnitName}` : ''}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {showCreate && (
        <CreateExecutionForm
          userId={userId}
          onDone={(id) => { setShowCreate(false); setDetailId(id); }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

/* ---------------- Chi tiết lượt ---------------- */

function EvidenceThumb({ evidence }: { evidence: EvidenceDto }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    let objUrl: string | null = null;
    fetch(`${API_BASE}${evidence.url}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && alive) {
          objUrl = URL.createObjectURL(b);
          setUrl(objUrl);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [evidence.url]);
  return (
    <a
      className="ev-thumb"
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      title={`${evidence.fileName} · ${evidence.uploadedByName ?? ''} · ${new Date(evidence.uploadedAt).toLocaleString('vi-VN')}`}
    >
      {url ? <img src={url} alt={evidence.fileName} /> : <span className="ev-thumb-loading">…</span>}
    </a>
  );
}

/** Nút chụp ảnh (D-12): mở camera thẳng trên mobile, chọn file trên desktop. */
function PhotoCapture({
  executionId,
  stepId,
  onUploaded,
}: {
  executionId: string;
  stepId: string;
  onUploaded: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
    setError('');
  };

  const upload = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('kind', 'PHOTO');
      await apiForm<{ evidence: EvidenceDto }>(
        `/executions/${executionId}/steps/${stepId}/evidence`,
        fd,
      );
      if (preview) URL.revokeObjectURL(preview);
      setFile(null);
      setPreview(null);
      onUploaded();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photo-capture">
      <label className="btn-small primary photo-btn">
        📷 Chụp ảnh
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileChange}
          hidden
        />
      </label>
      {preview && (
        <div className="photo-preview-wrap">
          <img src={preview} alt="Ảnh chuẩn bị tải lên" className="photo-preview" />
          <div className="photo-actions">
            <button type="button" className="btn-small primary" disabled={busy} onClick={upload}>
              {busy ? 'Đang tải lên…' : 'Tải ảnh lên'}
            </button>
            <button
              type="button"
              className="btn-small"
              disabled={busy}
              onClick={() => {
                if (preview) URL.revokeObjectURL(preview);
                setFile(null);
                setPreview(null);
              }}
            >
              Chụp lại
            </button>
          </div>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

function StepWorkCard({
  step,
  executionId,
  userId,
  canOperate,
  users,
  positions,
  req,
  onChanged,
}: {
  step: ExecutionStepDto;
  executionId: string;
  userId: string;
  canOperate: boolean;
  users: AssignableUser[];
  positions: PositionDto[];
  req: StepPositionReq | undefined;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showAssign, setShowAssign] = React.useState(false);
  const isMine = step.performerUserId === userId;
  const unassigned = !step.performerUserId;
  const needsPhoto =
    step.completion.some((c) => c.kind === 'PHOTO' && c.required) &&
    !step.evidence.some((e) => e.kind === 'PHOTO');

  const post = async (action: 'start' | 'complete') => {
    setBusy(true);
    setError('');
    try {
      await api(`/executions/${executionId}/steps/${step.id}/${action}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdemKey() },
      });
      onChanged();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  /** D-14: bắt đầu bước chưa phân công — tự gán cho mình nếu chức vụ khớp. */
  const startUnassigned = async () => {
    if (busy) return;
    const me = users.find((u) => u.id === userId);
    const need = req?.performerPositions.map((p) => p.id) ?? [];
    const mine = me?.positionIds ?? [];
    if (need.length > 0 && !need.some((id) => mine.includes(id))) {
      setError('Bạn không có chức vụ phù hợp với bước này.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/executions/${executionId}/steps/${step.id}/assign`, {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdemKey() },
        body: JSON.stringify({ performerUserId: userId }),
      });
      await api(`/executions/${executionId}/steps/${step.id}/start`, {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdemKey() },
      });
      onChanged();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`exec-step${isMine ? ' mine' : ''}`}>
      <div className="exec-step-head">
        <div>
          <code>{step.stepCode}</code>{' '}
          <strong>{step.title}</strong>{' '}
          <span className={`chip sm ${STEP_STATE_CHIP[step.state]}`}>
            {STEP_STATE_LABEL[step.state]}
          </span>{' '}
          {!step.required && <span className="chip sm muted">Tùy chọn</span>}
        </div>
        <div className="exec-step-people muted">
          👤 {step.performerName ?? 'Chưa phân công'}
          {step.supervisorName ? ` · 🛡 ${step.supervisorName}` : ''}
        </div>
      </div>

      {step.evidence.length > 0 && (
        <div className="ev-list">
          {step.evidence.map((e) => (
            <EvidenceThumb key={e.id} evidence={e} />
          ))}
        </div>
      )}

      {canOperate && step.state === 'PENDING' && (
        <div className="step-work-actions">
          {isMine && (
            <button type="button" className="btn-small primary" disabled={busy} onClick={() => post('start')}>
              {busy ? 'Đang xử lý…' : '▶ Bắt đầu bước'}
            </button>
          )}
          {unassigned && (
            <button type="button" className="btn-small primary" disabled={busy} onClick={startUnassigned}>
              {busy ? 'Đang xử lý…' : '▶ Bắt đầu'}
            </button>
          )}
          <button type="button" className="btn-small" disabled={busy} onClick={() => setShowAssign(true)}>
            👥 Phân công
          </button>
        </div>
      )}

      {isMine && canOperate && step.state === 'IN_PROGRESS' && (
        <div className="step-work-actions">
          <PhotoCapture
            executionId={executionId}
            stepId={step.id}
            onUploaded={onChanged}
          />
          {needsPhoto && (
            <p className="sec-desc warn-text">⚠ Bước này yêu cầu ảnh chụp (PRC-006) — phải tải ảnh lên trước khi hoàn thành.</p>
          )}
          <button
            type="button"
            className="btn-small primary"
            disabled={busy || needsPhoto}
            onClick={() => post('complete')}
            title={needsPhoto ? 'Cần ảnh chụp trước' : undefined}
          >
            {busy ? 'Đang xử lý…' : '✓ Hoàn thành bước'}
          </button>
        </div>
      )}

      {showAssign && (
        <AssignStepDialog
          executionId={executionId}
          step={step}
          req={req}
          users={users}
          positions={positions}
          onDone={() => { setShowAssign(false); onChanged(); }}
          onClose={() => setShowAssign(false)}
        />
      )}

      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

export function ExecutionDetail({
  executionId,
  userId,
  perms,
  onBack,
}: {
  executionId: string;
  userId: string;
  perms: string[];
  onBack: () => void;
}) {
  const [ex, setEx] = React.useState<ExecutionDto | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [users, setUsers] = React.useState<AssignableUser[]>([]);
  const [positions, setPositions] = React.useState<PositionDto[]>([]);
  const [stepReqs, setStepReqs] = React.useState<Record<string, StepPositionReq>>({});
  const canOperate = perms.includes('execution.operate');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = (await api(`/executions/${executionId}`)) as { execution: ExecutionDto };
      setEx(d.execution);
      // Yêu cầu chức vụ từng bước (D-14) — lấy từ bản quy trình, khớp theo step_code.
      try {
        const v = (await api(`/versions/${d.execution.versionId}`)) as {
          version: ProcessVersionDto;
          steps: VersionStepLite[];
        };
        const map: Record<string, StepPositionReq> = {};
        for (const s of v.steps ?? []) {
          map[s.code] = {
            performerPositions: s.performerPositions ?? [],
            supervisorPositions: s.supervisorPositions ?? [],
          };
        }
        setStepReqs(map);
      } catch {
        /* không chặn hiển thị chi tiết */
      }
      try {
        const u = (await api('/assignable-users')) as { items: AssignableUser[] };
        setUsers(u.items ?? []);
        const p = (await api('/positions')) as { items: PositionDto[] };
        setPositions(p.items ?? []);
      } catch {
        /* không chặn hiển thị chi tiết */
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  React.useEffect(() => { load(); }, [load]);

  const finishExecution = async (action: 'complete' | 'cancel') => {
    if (!ex || busy) return;
    if (action === 'cancel' && !window.confirm(`Hủy lượt ${ex.code}?`)) return;
    setBusy(true);
    setError('');
    try {
      const d = (await api(`/executions/${ex.id}/${action}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdemKey() },
      })) as { execution: ExecutionDto };
      setEx(d.execution);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="empty">Đang tải…</div>;
  if (error) {
    return (
      <div>
        <button type="button" className="btn-small" onClick={onBack}>← Danh sách</button>
        <div className="form-error">{error}</div>
      </div>
    );
  }
  if (!ex) return null;

  const done = ex.steps.filter((s) => s.state === 'DONE').length;
  const requiredDone = ex.steps.filter((s) => s.required && s.state === 'DONE').length;
  const requiredTotal = ex.steps.filter((s) => s.required).length;
  const canFinish = canOperate && ex.state === 'IN_PROGRESS' && requiredDone === requiredTotal;

  return (
    <div>
      <button type="button" className="btn-small" onClick={onBack}>← Danh sách lượt</button>
      <div className="proc-head">
        <div>
          <h3><code>{ex.code}</code> {ex.title || ex.processName}</h3>
          <p className="sec-desc">
            {ex.title ? <>{ex.processName} · </> : null}Bản v{ex.versionNo}
            {ex.executionDate ? ` · Ngày thực hiện: ${ex.executionDate}` : ''}
            {ex.executionTime ? ` ${ex.executionTime}` : ''}
            {ex.shift ? ` · Ca: ${SHIFT_LABEL[ex.shift]}` : ''}
            {ex.orgUnitName ? ` · ${ex.orgUnitName}` : ''}
          </p>
          <p className="sec-desc">
            Người tạo: {ex.createdByName ?? '—'}
            {' · '}Người thực hiện chính: {ex.mainPerformerName ?? ex.createdByName ?? '—'}
            {ex.supervisorName ? ` · Người giám sát: ${ex.supervisorName}` : ''}
          </p>
          <p className="sec-desc">
            Tạo lúc {new Date(ex.createdAt).toLocaleString('vi-VN')}
          </p>
          {ex.note && <p className="sec-desc">📝 {ex.note}</p>}
        </div>
        <span className={`chip ${EXEC_STATE_CHIP[ex.state]}`}>{EXEC_STATE_LABEL[ex.state]}</span>
      </div>

      <div className="exec-progress">
        <div className="exec-progress-bar">
          <div
            className="exec-progress-fill"
            style={{ width: ex.steps.length > 0 ? `${Math.round((done / ex.steps.length) * 100)}%` : '0%' }}
          />
        </div>
        <span className="muted">{done}/{ex.steps.length} bước</span>
      </div>

      <section className="section">
        <h3>Các bước ({ex.steps.length})</h3>
        <div className="exec-step-list">
          {ex.steps.map((s) => (
            <StepWorkCard
              key={s.id}
              step={s}
              executionId={ex.id}
              userId={userId}
              canOperate={canOperate}
              users={users}
              positions={positions}
              req={stepReqs[s.stepCode]}
              onChanged={load}
            />
          ))}
        </div>
      </section>

      {canOperate && (ex.state === 'IN_PROGRESS' || ex.state === 'CREATED') && (
        <div className="exec-actions">
          <button
            type="button"
            className="btn-small primary"
            disabled={busy || !canFinish}
            onClick={() => finishExecution('complete')}
            title={canFinish ? undefined : 'Còn bước bắt buộc chưa hoàn thành'}
          >
            ✓ Kết thúc lượt
          </button>
          <button
            type="button"
            className="btn-small danger"
            disabled={busy}
            onClick={() => finishExecution('cancel')}
          >
            Hủy lượt
          </button>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

/* ---------------- Form tạo lượt ---------------- */

interface VersionStepLite {
  id: string;
  code: string;
  title: string;
  required: boolean;
  performerPositions: PositionDto[];
  supervisorPositions: PositionDto[];
}

/** Yêu cầu chức vụ của một bước (D-14) — dùng cho dialog phân công. */
interface StepPositionReq {
  performerPositions: PositionDto[];
  supervisorPositions: PositionDto[];
}

interface AssignableUser {
  id: string;
  username: string;
  displayName: string;
  positionIds: string[];
}

/* ---------------- Dialog phân công bước (D-14) ---------------- */

/** D-14: chọn tên người kèm chức vụ ("Nguyễn Văn A — Thủ kho"), lọc theo vai trò bước. */
function AssignStepDialog({
  executionId,
  step,
  req,
  users,
  positions,
  onDone,
  onClose,
}: {
  executionId: string;
  step: ExecutionStepDto;
  req: StepPositionReq | undefined;
  users: AssignableUser[];
  positions: PositionDto[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [performer, setPerformer] = React.useState(step.performerUserId ?? '');
  const [supervisor, setSupervisor] = React.useState(step.supervisorUserId ?? '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const posName = (id: string) => positions.find((p) => p.id === id)?.name ?? id;
  const userLabel = (u: AssignableUser) => {
    const names = u.positionIds.map(posName).filter((x) => x && x !== '');
    return `${u.displayName} — ${names.join(', ') || '—'}`;
  };
  const filterByPositions = (need: PositionDto[]) => {
    if (need.length === 0) return users;
    const set = new Set(need.map((p) => p.id));
    return users.filter((u) => u.positionIds.some((id) => set.has(id)));
  };
  const perfReq = req?.performerPositions ?? [];
  const supReq = req?.supervisorPositions ?? [];
  const perfCandidates = filterByPositions(perfReq);
  const supCandidates = filterByPositions(supReq);

  const submit = async () => {
    if (!performer || busy) return;
    setBusy(true);
    setError('');
    try {
      const body: AssignStepBody = {
        performerUserId: performer,
        supervisorUserId: supervisor || null,
      };
      await api(`/executions/${executionId}/steps/${step.id}/assign`, {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdemKey() },
        body: JSON.stringify(body),
      });
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const reqHint = (need: PositionDto[]) =>
    need.length === 0
      ? 'Bước này chưa gắn chức vụ — ai cũng có thể nhận.'
      : `Chỉ hiện người giữ chức vụ: ${need.map((p) => p.name).join(', ')}.`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>👥 Phân công bước {step.stepCode}</h3>
        <p className="sec-desc">{step.title}</p>
        <div className="field">
          <label>Người thực hiện *</label>
          <select className="input" value={performer} onChange={(e) => setPerformer(e.target.value)}>
            <option value="">— Chọn —</option>
            {perfCandidates.map((u) => (
              <option key={u.id} value={u.id}>{userLabel(u)}</option>
            ))}
          </select>
          <p className="sec-desc">{reqHint(perfReq)}</p>
        </div>
        <div className="field">
          <label>Người giám sát</label>
          <select className="input" value={supervisor} onChange={(e) => setSupervisor(e.target.value)}>
            <option value="">— Không gán —</option>
            {supCandidates.map((u) => (
              <option key={u.id} value={u.id}>{userLabel(u)}</option>
            ))}
          </select>
          <p className="sec-desc">{reqHint(supReq)}</p>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Hủy</button>
          <button type="button" className="btn-primary" disabled={busy || !performer} onClick={submit}>
            {busy ? 'Đang lưu…' : 'Lưu phân công'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Form tạo lượt đơn giản (D-14) ---------------- */

function CreateExecutionForm({
  userId,
  onDone,
  onCancel,
}: {
  userId: string;
  onDone: (executionId: string) => void;
  onCancel: () => void;
}) {
  const [processes, setProcesses] = React.useState<ProcessDto[]>([]);
  const [users, setUsers] = React.useState<AssignableUser[]>([]);
  const [processId, setProcessId] = React.useState('');
  const [versionId, setVersionId] = React.useState('');
  const [versionNo, setVersionNo] = React.useState<number | null>(null);
  const [title, setTitle] = React.useState('');
  const [executionDate, setExecutionDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [executionTime, setExecutionTime] = React.useState('');
  const [shift, setShift] = React.useState('');
  const [createdBy, setCreatedBy] = React.useState(userId);
  const [mainPerformerId, setMainPerformerId] = React.useState('');
  const [supervisorId, setSupervisorId] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loadingVersion, setLoadingVersion] = React.useState(false);

  React.useEffect(() => {
    api('/processes?hasActiveVersion=1&limit=100')
      .then((d) => setProcesses((d as { items: ProcessDto[] }).items ?? []))
      .catch(() => setProcesses([]));
    api('/assignable-users')
      .then((d) => setUsers((d as { items: AssignableUser[] }).items ?? []))
      .catch(() => setUsers([]));
  }, []);

  const loadVersion = async (pid: string) => {
    setProcessId(pid);
    setVersionId('');
    setVersionNo(null);
    if (!pid) return;
    setLoadingVersion(true);
    setError('');
    try {
      const v = (await api(`/processes/${pid}/versions`)) as { versions: ProcessVersionDto[] };
      const active = (v.versions ?? []).find((x) => x.state === 'ACTIVE');
      if (!active) {
        setError('Quy trình chưa có bản ACTIVE — không thể tạo lượt.');
        return;
      }
      setVersionId(active.id);
      setVersionNo(active.versionNo);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingVersion(false);
    }
  };

  const valid = processId !== '' && versionId !== '' && executionDate !== '' && createdBy !== '';

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const body: CreateExecutionBody = {
        processVersionId: versionId,
        title: title.trim() || null,
        executionDate: executionDate || null,
        executionTime: executionTime || null,
        shift: (shift || null) as ExecutionShift | null,
        createdBy: createdBy || null,
        mainPerformerId: mainPerformerId || null,
        supervisorId: supervisorId || null,
      };
      const d = (await api('/executions', {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdemKey() },
        body: JSON.stringify(body),
      })) as { execution: { id: string } };
      onDone(d.execution.id);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Tạo lượt thực hiện</h3>
        <div className="field">
          <label>Quy trình *</label>
          <select className="input" value={processId} onChange={(e) => loadVersion(e.target.value)}>
            <option value="">— Chọn quy trình —</option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
          <p className="sec-desc">Chỉ hiện quy trình có phiên bản đang hiệu lực.</p>
        </div>
        {loadingVersion && <div className="empty">Đang tải bản ACTIVE…</div>}
        {versionNo !== null && (
          <p className="sec-desc">Dùng bản <strong>v{versionNo} (ACTIVE)</strong>.</p>
        )}
        <div className="field">
          <label>Tiêu đề lượt</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Xuất hàng đợt sáng 18/10"
          />
        </div>
        <div className="field">
          <label>Ngày thực hiện *</label>
          <input
            type="date"
            className="input"
            value={executionDate}
            onChange={(e) => setExecutionDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Giờ thực hiện</label>
          <input
            type="time"
            className="input"
            value={executionTime}
            onChange={(e) => setExecutionTime(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Ca làm việc</label>
          <select className="input" value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="">— Chọn ca —</option>
            <option value="SANG">Sáng</option>
            <option value="CHIEU">Chiều</option>
            <option value="TOI">Tối</option>
          </select>
        </div>
        <div className="field">
          <label>Người tạo *</label>
          <select className="input" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}{u.id === userId ? ' (tôi)' : ''}
              </option>
            ))}
          </select>
          <p className="sec-desc">Người chịu trách nhiệm tạo lượt thực hiện này.</p>
        </div>
        <div className="field">
          <label>Người thực hiện chính</label>
          <select className="input" value={mainPerformerId} onChange={(e) => setMainPerformerId(e.target.value)}>
            <option value="">Tôi (mặc định)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.displayName}</option>
            ))}
          </select>
          <p className="sec-desc">Để trống = người tạo cũng là người thực hiện chính.</p>
        </div>
        <div className="field">
          <label>Người giám sát</label>
          <select className="input" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
            <option value="">— Không có —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.displayName}</option>
            ))}
          </select>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Hủy</button>
          <button type="button" className="btn-primary" disabled={busy || !valid} onClick={submit}>
            {busy ? 'Đang tạo…' : 'Tạo lượt'}
          </button>
        </div>
      </div>
    </div>
  );
}
