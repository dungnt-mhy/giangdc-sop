/**
 * Lượt thực hiện + Chụp ảnh bằng chứng (T3, D-12).
 * EXE-001..013, EVD-001..013 (phạm vi D-12).
 */
import React from 'react';
import type {
  CreateExecutionBody,
  EvidenceDto,
  ExecutionDto,
  ExecutionState,
  ExecutionStepDto,
  ExecutionStepState,
  PositionDto,
  ProcessDto,
  ProcessVersionDto,
  StepAssignmentBody,
} from '@giangdc-sop/contracts';
import { api, API_BASE } from './App.js';

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
    headers: { 'X-Idempotency-Key': newIdemKey() },
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
                <div className="exec-card-title">{ex.processName} — Bản v{ex.versionNo}</div>
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
  onChanged,
}: {
  step: ExecutionStepDto;
  executionId: string;
  userId: string;
  canOperate: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const isMine = step.performerUserId === userId;
  const needsPhoto =
    step.completion.some((c) => c.kind === 'PHOTO' && c.required) &&
    !step.evidence.some((e) => e.kind === 'PHOTO');

  const post = async (action: 'start' | 'complete') => {
    setBusy(true);
    setError('');
    try {
      await api(`/executions/${executionId}/steps/${step.id}/${action}`, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': newIdemKey() },
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
          👤 {step.performerName ?? '—'}
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

      {isMine && canOperate && step.state === 'PENDING' && (
        <button type="button" className="btn-small primary" disabled={busy} onClick={() => post('start')}>
          {busy ? 'Đang xử lý…' : '▶ Bắt đầu bước'}
        </button>
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
  const canOperate = perms.includes('execution.operate');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = (await api(`/executions/${executionId}`)) as { execution: ExecutionDto };
      setEx(d.execution);
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
        headers: { 'X-Idempotency-Key': newIdemKey() },
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
          <h3><code>{ex.code}</code> {ex.processName}</h3>
          <p className="sec-desc">
            Bản v{ex.versionNo} · {ex.createdByName ?? ''} · {new Date(ex.createdAt).toLocaleString('vi-VN')}
            {ex.orgUnitName ? ` · ${ex.orgUnitName}` : ''}
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

interface AssignableUser {
  id: string;
  username: string;
  displayName: string;
  positionIds: string[];
}

function CreateExecutionForm({
  onDone,
  onCancel,
}: {
  onDone: (executionId: string) => void;
  onCancel: () => void;
}) {
  const [processes, setProcesses] = React.useState<ProcessDto[]>([]);
  const [processId, setProcessId] = React.useState('');
  const [version, setVersion] = React.useState<ProcessVersionDto | null>(null);
  const [steps, setSteps] = React.useState<VersionStepLite[]>([]);
  const [users, setUsers] = React.useState<AssignableUser[]>([]);
  const [positions, setPositions] = React.useState<PositionDto[]>([]);
  const [note, setNote] = React.useState('');
  const [assign, setAssign] = React.useState<Record<string, { performer: string; supervisor: string }>>({});
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loadingSteps, setLoadingSteps] = React.useState(false);

  React.useEffect(() => {
    api('/processes')
      .then((d) => setProcesses((d as { items: ProcessDto[] }).items ?? []))
      .catch(() => setProcesses([]));
    api('/assignable-users')
      .then((d) => setUsers((d as { items: AssignableUser[] }).items ?? []))
      .catch(() => setUsers([]));
    api('/positions')
      .then((d) => setPositions((d as { items: PositionDto[] }).items ?? []))
      .catch(() => setPositions([]));
  }, []);

  const loadVersion = async (pid: string) => {
    setProcessId(pid);
    setVersion(null);
    setSteps([]);
    setAssign({});
    if (!pid) return;
    setLoadingSteps(true);
    setError('');
    try {
      const v = (await api(`/processes/${pid}/versions`)) as { items: ProcessVersionDto[] };
      const active = (v.items ?? []).find((x) => x.state === 'ACTIVE');
      if (!active) {
        setError('Quy trình chưa có bản ACTIVE — không thể tạo lượt.');
        return;
      }
      setVersion(active);
      const det = (await api(`/versions/${active.id}`)) as {
        version: ProcessVersionDto;
        steps: VersionStepLite[];
      };
      const ss = det.steps ?? [];
      setSteps(ss);
      const init: Record<string, { performer: string; supervisor: string }> = {};
      for (const s of ss) init[s.id] = { performer: '', supervisor: '' };
      setAssign(init);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingSteps(false);
    }
  };

  const posName = (id: string) => positions.find((p) => p.id === id)?.name ?? id;

  const candidates = (step: VersionStepLite, kind: 'performer' | 'supervisor') => {
    const need =
      kind === 'performer'
        ? step.performerPositions.map((p) => p.id)
        : step.supervisorPositions.map((p) => p.id);
    if (need.length === 0) return users;
    const needSet = new Set(need);
    return users.filter((u) => u.positionIds.some((id) => needSet.has(id)));
  };

  const setA = (stepId: string, field: 'performer' | 'supervisor', value: string) => {
    setAssign((prev) => ({ ...prev, [stepId]: { ...prev[stepId], [field]: value } }));
  };

  const valid = steps.length > 0 && steps.every((s) => assign[s.id]?.performer);

  const submit = async () => {
    if (!version || !valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const assignments: StepAssignmentBody[] = steps.map((s) => ({
        stepId: s.id,
        performerUserId: assign[s.id].performer,
        supervisorUserId: assign[s.id].supervisor || null,
      }));
      const body: CreateExecutionBody = {
        processVersionId: version.id,
        note: note.trim() || null,
        assignments,
      };
      const d = (await api('/executions', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': newIdemKey() },
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
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Tạo lượt thực hiện</h3>
        <div className="field">
          <label>Quy trình *</label>
          <select className="input" value={processId} onChange={(e) => loadVersion(e.target.value)}>
            <option value="">— Chọn quy trình —</option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </div>
        {loadingSteps && <div className="empty">Đang tải bản ACTIVE…</div>}
        {version && (
          <p className="sec-desc">
            Dùng bản <strong>v{version.versionNo} (ACTIVE)</strong> — gán người cho từng bước.
            Người thực hiện phải giữ chức vụ khớp "Vai trò thực hiện" của bước (nếu có).
          </p>
        )}
        {steps.map((s) => {
          const perfs = candidates(s, 'performer');
          const sups = candidates(s, 'supervisor');
          return (
            <div key={s.id} className="assign-row">
              <div className="assign-step">
                <code>{s.code}</code> {s.title}
                <div className="muted sm-text">
                  Vai trò thực hiện: {s.performerPositions.length > 0 ? s.performerPositions.map((p) => p.name).join(', ') : '—'}
                  {' · '}Vai trò giám sát: {s.supervisorPositions.length > 0 ? s.supervisorPositions.map((p) => p.name).join(', ') : '—'}
                </div>
              </div>
              <div className="assign-fields">
                <div className="field">
                  <label>Người thực hiện *</label>
                  <select
                    className="input"
                    value={assign[s.id]?.performer ?? ''}
                    onChange={(e) => setA(s.id, 'performer', e.target.value)}
                  >
                    <option value="">— Chọn —</option>
                    {perfs.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName} ({u.positionIds.map(posName).join(', ') || '—'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Người giám sát</label>
                  <select
                    className="input"
                    value={assign[s.id]?.supervisor ?? ''}
                    onChange={(e) => setA(s.id, 'supervisor', e.target.value)}
                  >
                    <option value="">— Không gán —</option>
                    {sups.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName} ({u.positionIds.map(posName).join(', ') || '—'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
        {steps.length > 0 && (
          <div className="field">
            <label>Ghi chú</label>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú cho lượt thực hiện (không bắt buộc)"
            />
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Hủy</button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !valid}
            onClick={submit}
          >
            {busy ? 'Đang tạo…' : 'Tạo lượt'}
          </button>
        </div>
      </div>
    </div>
  );
}
