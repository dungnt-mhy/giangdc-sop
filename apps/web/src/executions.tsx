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
  ProcessStepDto,
  ProcessVersionDto,
} from '@giangdc-sop/contracts';
import { api, API_BASE } from './App.js';
import { ProcessDiagram } from './processes.js';
import { parseHash, setHash } from './hashRoute.js';

const SHIFT_LABEL: Record<ExecutionShift, string> = {
  SANG: 'Sáng',
  CHIEU: 'Chiều',
  TOI: 'Tối',
};

const EXEC_STATE_LABEL: Record<ExecutionState, string> = {  CREATED: 'Mới tạo',
  IN_PROGRESS: 'Đang thực hiện',
  PAUSED: 'Tạm dừng',
  BLOCKED: 'Bị chặn',
  COMPLETED: 'Hoàn thành',
  PENDING_APPROVAL: 'Chờ xác nhận',
  APPROVED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

const EXEC_STATE_CHIP: Record<ExecutionState, string> = {
  CREATED: '',
  IN_PROGRESS: '',
  PAUSED: 'warn',
  BLOCKED: 'warn',
  COMPLETED: 'ok',
  PENDING_APPROVAL: 'warn',
  APPROVED: 'ok',
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

export function ExecutionsView({ perms, userId, isSeniorApprover }: {
  perms: string[];
  userId: string;
  isSeniorApprover: boolean;
}) {
  const [items, setItems] = React.useState<ExecutionDto[]>([]);
  const [mineOnly, setMineOnly] = React.useState(true);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  // Hash-routing: refresh giữ chi tiết lượt đang xem.
  const [detailId, setDetailId] = React.useState<string | null>(() => {
    const r = parseHash();
    return r.nav === 'executions' ? (r.executionId ?? null) : null;
  });
  const detailRef = React.useRef(detailId);
  detailRef.current = detailId;
  const canCreate = perms.includes('execution.create');

  /** Mở/đóng chi tiết lượt + đồng bộ hash (setHash tránh vòng lặp khi không đổi). */
  const openDetail = React.useCallback((id: string | null) => {
    detailRef.current = id;
    setDetailId(id);
    setHash(id ? `#/executions/${id}` : '#/executions');
  }, []);

  // Back/forward trình duyệt hoặc bấm chuông thông báo (đi qua hash).
  React.useEffect(() => {
    const onHash = () => {
      const r = parseHash();
      if (r.nav !== 'executions') return;
      const id = r.executionId ?? null;
      if (id === detailRef.current) return; // do chính mình gây ra
      detailRef.current = id;
      setDetailId(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
        isSeniorApprover={isSeniorApprover}
        onBack={() => { openDetail(null); load(); }}
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
                onClick={() => openDetail(ex.id)}
              >
                <div className="exec-card-head">
                  <code>{ex.code}</code>
                  <span className={`chip sm ${EXEC_STATE_CHIP[ex.state]}`}>
                    {EXEC_STATE_LABEL[ex.state]}
                  </span>
                  {ex.lastRejectKind === 'steps' && (
                    <span className="chip sm warn">🔄 Bị trả lại: {ex.rejectedStepCount} bước</span>
                  )}
                  {ex.lastRejectKind === 'all' && (
                    <span className="chip sm warn">🔄 Bị trả lại làm lại</span>
                  )}
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
                  {ex.createdByName ?? ''}{ex.createdByPositions ? ` — ${ex.createdByPositions}` : ''} · {new Date(ex.createdAt).toLocaleDateString('vi-VN')}
                  {ex.orgUnitName ? ` · ${ex.orgUnitName}` : ''}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {showCreate && (
        <CreateExecutionForm
          onDone={(id) => { setShowCreate(false); openDetail(id); }}
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
  if (evidence.kind === 'FILE') {
    return (
      <a
        className="ev-file-chip"
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        title={`${evidence.fileName} · ${evidence.uploadedByName ?? ''} · ${new Date(evidence.uploadedAt).toLocaleString('vi-VN')}`}
      >
        📎 {evidence.fileName}
      </a>
    );
  }
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

/** Nén ảnh phía client (D-15): canvas, cạnh dài tối đa 1920px, JPEG quality 0.82. */
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1920;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}

const MAX_EVIDENCE_CLIENT_BYTES = 5 * 1024 * 1024;
const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Upload bằng chứng (D-12/D-15): "📷 Chụp" (camera) + "+ Ảnh" (chọn ảnh) + "+ Tệp" (tài liệu). */
function EvidenceUpload({
  executionId,
  stepId,
  onUploaded,
}: {
  executionId: string;
  stepId: string;
  onUploaded: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [kind, setKind] = React.useState<'PHOTO' | 'FILE'>('PHOTO');
  const [preview, setPreview] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const onFileChange = (k: 'PHOTO' | 'FILE') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setKind(k);
    setPreview(f && k === 'PHOTO' ? URL.createObjectURL(f) : null);
    setError('');
  };

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setError('');
  };

  const upload = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      let toSend = file;
      if (kind === 'PHOTO') {
        // D-15: nén ảnh phía client trước khi upload.
        toSend = await compressImage(file);
        if (toSend.size > MAX_EVIDENCE_CLIENT_BYTES) {
          throw new Error('Ảnh sau khi nén vẫn vượt quá 5MB, vui lòng chọn ảnh khác.');
        }
      } else if (toSend.size > MAX_EVIDENCE_CLIENT_BYTES) {
        throw new Error('Tệp vượt quá 5MB.');
      }
      const fd = new FormData();
      fd.append('photo', toSend);
      fd.append('kind', kind);
      await apiForm<{ evidence: EvidenceDto }>(
        `/executions/${executionId}/steps/${stepId}/evidence`,
        fd,
      );
      clear();
      onUploaded();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photo-capture">
      <div className="ev-btn-row">
        <label className="btn-small primary photo-btn">
          📷 Chụp
          <input type="file" accept="image/*" capture="environment" onChange={onFileChange('PHOTO')} hidden />
        </label>
        <label className="btn-small photo-btn">
          + Ảnh
          <input type="file" accept="image/*" onChange={onFileChange('PHOTO')} hidden />
        </label>
        <label className="btn-small photo-btn">
          + Tệp
          <input type="file" accept={DOC_ACCEPT} onChange={onFileChange('FILE')} hidden />
        </label>
      </div>
      {file && (
        <div className="photo-preview-wrap">
          {preview ? (
            <img src={preview} alt="Ảnh chuẩn bị tải lên" className="photo-preview" />
          ) : (
            <div className="ev-file-name">📄 {file.name}</div>
          )}
          <div className="photo-actions">
            <button type="button" className="btn-small primary" disabled={busy} onClick={upload}>
              {busy ? 'Đang tải lên…' : kind === 'PHOTO' ? 'Tải ảnh lên' : 'Tải tệp lên'}
            </button>
            <button type="button" className="btn-small" disabled={busy} onClick={clear}>
              Chọn lại
            </button>
          </div>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

/* ---------------- Hướng dẫn chi tiết bước (D-17) ---------------- */

/** Các trường hướng dẫn từ quy trình, kèm nhãn tiếng Việt. */
const GUIDE_FIELDS: Array<{ key: keyof ProcessStepDto; label: string }> = [
  { key: 'prerequisites', label: 'Điều kiện tiên quyết' },
  { key: 'inputs', label: 'Đầu vào' },
  { key: 'instructions', label: 'Hướng dẫn thực hiện' },
  { key: 'expectedResult', label: 'Kết quả mong đợi' },
  { key: 'outputs', label: 'Đầu ra' },
  { key: 'notes', label: 'Ghi chú' },
  { key: 'warnings', label: '⚠ Cảnh báo' },
];

function StepGuide({ guide, open, onToggle }: {
  guide: ProcessStepDto;
  open: boolean;
  onToggle: () => void;
}) {
  const items = GUIDE_FIELDS
    .map(({ key, label }) => ({ label, text: (guide[key] as string | null)?.trim() }))
    .filter((i) => !!i.text);
  if (items.length === 0) return null;
  return (
    <div className="step-guide">
      <button type="button" className="guide-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? '▼' : '▶'} 📋 Chi tiết bước
      </button>
      {open && (
        <div className="guide-panel">
          {items.map((i) => (
            <div key={i.label} className="guide-item">
              <div className="guide-label">{i.label}</div>
              <div className="guide-text">{i.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** D-19: tập rỗng dùng cho ProcessDiagram ở chế độ xem (không click mở chi tiết). */
const EMPTY_STEP_SET: Set<string> = new Set();

function StepWorkCard({
  step,
  executionId,
  userId,
  canOperate,
  users,
  positions,
  req,
  blockedByOrder,
  guide,
  lastRedoReason,
  onChanged,
}: {
  step: ExecutionStepDto;
  executionId: string;
  userId: string;
  canOperate: boolean;
  users: AssignableUser[];
  positions: PositionDto[];
  req: StepPositionReq | undefined;
  /** D-16: true khi còn bước trước chưa DONE (bước làm tuần tự). */
  blockedByOrder: boolean;
  /** D-17: chi tiết bước từ quy trình (hướng dẫn), map theo stepCode. */
  guide: ProcessStepDto | undefined;
  /** D-21: lý do của lần trả làm lại gần nhất chứa bước này (cho tooltip badge). */
  lastRedoReason: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showAssign, setShowAssign] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);
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

  const showStartRow = canOperate && step.state === 'PENDING';
  const showCompleteRow = isMine && canOperate && step.state === 'IN_PROGRESS';
  const canUpload = isMine && canOperate && step.state === 'IN_PROGRESS';
  const showEvidence = step.evidence.length > 0 || canUpload;

  return (
    <div className={`exec-step st-${step.state === 'DONE' ? 'done' : step.state === 'IN_PROGRESS' ? 'progress' : 'pending'}${isMine ? ' mine' : ''}${blockedByOrder ? ' blocked' : ''}`}>
      {/* D-19: dòng 1 — badge số + mã — tên + chip trạng thái */}
      <div className="step-card-head">
        <span className="step-num" aria-hidden="true">{step.sortOrder}</span>
        <div className="step-card-title">
          <code>{step.stepCode}</code> — <strong>{step.title}</strong>{' '}
          <span className={`chip sm ${STEP_STATE_CHIP[step.state]}`}>
            {STEP_STATE_LABEL[step.state]}
          </span>{' '}
          {!step.required && <span className="chip sm muted">Tùy chọn</span>}{' '}
          {step.redoCount > 0 && (
            <span
              className="chip sm warn"
              title={lastRedoReason ? `Lý do trả làm lại: ${lastRedoReason}` : undefined}
            >
              🔄 Làm lại lần {step.redoCount}
            </span>
          )}
        </div>
      </div>

      {/* D-19: dòng 2 — nút hành động (giữ nguyên mọi điều kiện hiển thị) */}
      {showStartRow && (
        <div className="step-card-actions">
          {!blockedByOrder && (isMine || unassigned) && (
            <button
              type="button"
              className="btn-start"
              disabled={busy}
              onClick={isMine ? () => post('start') : startUnassigned}
            >
              {busy ? 'Đang xử lý…' : 'Bắt đầu'}
            </button>
          )}
          <button type="button" className="btn-assign" disabled={busy} onClick={() => setShowAssign(true)}>
            👥 Phân công
          </button>
        </div>
      )}
      {showCompleteRow && (
        <div className="step-card-actions">
          <button
            type="button"
            className="btn-start"
            disabled={busy || needsPhoto}
            onClick={() => post('complete')}
            title={needsPhoto ? 'Cần ảnh chụp trước' : undefined}
          >
            {busy ? 'Đang xử lý…' : '✓ Hoàn thành bước'}
          </button>
        </div>
      )}

      {/* D-19: người thực hiện */}
      <div className={`step-card-assignee${unassigned ? ' unassigned' : ''}`}>
        {unassigned ? 'Chưa phân công' : `👤 ${step.performerName}`}
        {step.supervisorName ? ` · 🛡 ${step.supervisorName}` : ''}
      </div>
      {blockedByOrder && step.state === 'PENDING' && (
        <div className="muted">🔒 Hoàn thành các bước trước để mở bước này.</div>
      )}

      {/* D-19: chi tiết bước (collapse) */}
      {guide && <StepGuide guide={guide} open={guideOpen} onToggle={() => setGuideOpen(!guideOpen)} />}

      {/* D-19: khối bằng chứng */}
      {showEvidence && (
        <div className="step-evidence">
          <div className="step-evidence-title">📷 Bằng chứng</div>
          {step.evidence.length > 0 && (
            <div className="ev-list">
              {step.evidence.map((e) => (
                <EvidenceThumb key={e.id} evidence={e} />
              ))}
            </div>
          )}
          {canUpload && (
            <EvidenceUpload
              executionId={executionId}
              stepId={step.id}
              onUploaded={onChanged}
            />
          )}
          {showCompleteRow && needsPhoto && (
            <p className="sec-desc warn-text">⚠ Bước này yêu cầu ảnh chụp (PRC-006) — phải tải ảnh lên trước khi hoàn thành.</p>
          )}
          {canUpload && (
            <p className="sec-desc muted">Ảnh được nén trước khi tải lên (tối đa 5MB). Tệp: PDF, Word, Excel, tối đa 5MB.</p>
          )}
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
  isSeniorApprover,
  onBack,
}: {
  executionId: string;
  userId: string;
  perms: string[];
  isSeniorApprover: boolean;
  onBack: () => void;
}) {
  const [ex, setEx] = React.useState<ExecutionDto | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [users, setUsers] = React.useState<AssignableUser[]>([]);
  const [positions, setPositions] = React.useState<PositionDto[]>([]);
  const [stepReqs, setStepReqs] = React.useState<Record<string, StepPositionReq>>({});
  /** D-17: chi tiết bước từ quy trình (hướng dẫn), map theo stepCode. */
  const [guides, setGuides] = React.useState<Record<string, ProcessStepDto>>({});
  /** D-17: modal xác nhận hủy lượt (thay window.confirm). */
  const [cancelOpen, setCancelOpen] = React.useState(false);
  /** D-19: chế độ xem bước — danh sách hoặc sơ đồ. */
  const [stepsView, setStepsView] = React.useState<'list' | 'diagram'>('list');
  const canOperate = perms.includes('execution.operate');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = (await api(`/executions/${executionId}`)) as { execution: ExecutionDto };
      setEx(d.execution);
      // Yêu cầu chức vụ từng bước (D-14) + hướng dẫn chi tiết (D-17) — từ bản quy trình, khớp theo step_code.
      try {
        const v = (await api(`/versions/${d.execution.versionId}`)) as {
          version: ProcessVersionDto;
          steps: ProcessStepDto[];
        };
        const map: Record<string, StepPositionReq> = {};
        const gmap: Record<string, ProcessStepDto> = {};
        for (const s of v.steps ?? []) {
          map[s.code] = {
            performerPositions: s.performerPositions ?? [],
            supervisorPositions: s.supervisorPositions ?? [],
          };
          gmap[s.code] = s;
        }
        setStepReqs(map);
        setGuides(gmap);
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

  const runAction = async (action: 'start' | 'pause' | 'resume' | 'cancel' | 'submit' | 'cancel-submit' | 'approve') => {
    if (!ex || busy) return;
    setBusy(true);
    setError('');
    try {
      const d = (await api(`/executions/${ex.id}/${action}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdemKey() },
      })) as { execution: ExecutionDto };
      setEx(d.execution);
      if (action === 'cancel') setCancelOpen(false);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  /** D-21: phương án từ chối — 'all' trả toàn bộ, 'steps' chọn bước làm lại. */
  const [rejectMode, setRejectMode] = React.useState<'all' | 'steps'>('all');
  const [rejectStepIds, setRejectStepIds] = React.useState<string[]>([]);

  const openReject = () => {
    setRejectReason('');
    setRejectMode('all');
    setRejectStepIds([]);
    setRejectOpen(true);
  };

  const doReject = async () => {
    if (!ex || busy || !rejectReason.trim()) return;
    if (rejectMode === 'steps' && rejectStepIds.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const d = (await api(`/executions/${ex.id}/reject`, {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdemKey() },
        body: JSON.stringify({
          reason: rejectReason.trim(),
          mode: rejectMode,
          ...(rejectMode === 'steps' ? { stepIds: rejectStepIds } : {}),
        }),
      })) as { execution: ExecutionDto };
      setEx(d.execution);
      setRejectOpen(false);
      setRejectReason('');
      setRejectStepIds([]);
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

  /* D-18: nhật ký duyệt — mới nhất trước; lịch sử từ chối đánh số cũ → mới. */
  const reviews = ex.reviews ?? [];
  const rejects = reviews.filter((r) => r.action === 'reject').slice().reverse();
  const isReturned = reviews.length > 0 && reviews[0].action === 'reject' && ex.state === 'IN_PROGRESS';
  const pct = ex.steps.length > 0 ? Math.round((done / ex.steps.length) * 100) : 0;
  const approverName = ex.supervisorName ?? ex.approvedByName ?? null;
  const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');
  /* Vết báo/xác nhận gần nhất (từ nhật ký, không trùng với lịch sử từ chối). */
  const latestSubmit = reviews.find((r) => r.action === 'submit');
  const latestApprove = reviews.find((r) => r.action === 'approve');

  /** D-17: meta gọn thành lưới — chỉ hiện mục có dữ liệu. */
  return (
    <div>
      <button type="button" className="btn-small" onClick={onBack}>← Danh sách lượt</button>
      <div className="proc-head">
        <div>
          <h3><code>{ex.code}</code> {ex.title || ex.processName}</h3>
          <p className="sec-desc">
            {ex.title ? <>{ex.processName} · </> : null}Bản v{ex.versionNo}
          </p>
        </div>
        <span className={`chip ${EXEC_STATE_CHIP[ex.state]}`}>{EXEC_STATE_LABEL[ex.state]}</span>
      </div>

      {/* D-17: cụm nút hành động sticky ngay dưới header */}
      <div className="exec-actions-sticky">
        {canOperate && ex.state === 'CREATED' && (
          <>
            <button type="button" className="btn-small primary" disabled={busy} onClick={() => runAction('start')}>
              {busy ? 'Đang xử lý…' : '▶ Bắt đầu'}
            </button>
            <button type="button" className="btn-small danger" disabled={busy} onClick={() => setCancelOpen(true)}>
              Hủy lượt
            </button>
          </>
        )}
        {canOperate && ex.state === 'IN_PROGRESS' && (
          <>
            <button type="button" className="btn-small" disabled={busy} onClick={() => runAction('pause')}>
              {busy ? 'Đang xử lý…' : '⏸ Tạm dừng'}
            </button>
            <button
              type="button"
              className="btn-small primary"
              disabled={busy || !canFinish}
              onClick={() => runAction('submit')}
              title={canFinish ? undefined : 'Còn bước bắt buộc chưa hoàn thành'}
            >
              📤 Báo hoàn thành
            </button>
            <button type="button" className="btn-small danger" disabled={busy} onClick={() => setCancelOpen(true)}>
              Hủy lượt
            </button>
          </>
        )}
        {canOperate && ex.state === 'PAUSED' && (
          <>
            <button type="button" className="btn-small primary" disabled={busy} onClick={() => runAction('resume')}>
              {busy ? 'Đang xử lý…' : '▶ Tiếp tục'}
            </button>
            <button type="button" className="btn-small danger" disabled={busy} onClick={() => setCancelOpen(true)}>
              Hủy lượt
            </button>
          </>
        )}
        {ex.state === 'PENDING_APPROVAL' && (
          <>
            {ex.approvalRequestedBy === userId && (
              <button type="button" className="btn-small" disabled={busy} onClick={() => runAction('cancel-submit')}>
                {busy ? 'Đang xử lý…' : '↩ Hủy báo hoàn thành'}
              </button>
            )}
            {(ex.supervisorId === userId || isSeniorApprover) && (
              <>
                <button type="button" className="btn-small primary" disabled={busy} onClick={() => runAction('approve')}>
                  {busy ? 'Đang xử lý…' : '✓ Xác nhận hoàn thành'}
                </button>
                <button type="button" className="btn-small danger" disabled={busy} onClick={openReject}>
                  ✕ Từ chối
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* D-18: Thông tin lượt công việc đầy đủ (theo hình tham khảo) */}
      <section className="exec-info">
        <h3>Thông tin lượt công việc</h3>

        <div className="exec-info-row">
          <div className="info-label">Trạng thái</div>
          <div className="info-value">
            <span className={`chip ${EXEC_STATE_CHIP[ex.state]}`}>{EXEC_STATE_LABEL[ex.state]}</span>
            {isReturned && ex.rejectedStepCount > 0 && (
              <span className="chip warn">🔄 Bị trả lại: {ex.rejectedStepCount} bước làm lại</span>
            )}
            {isReturned && ex.rejectedStepCount === 0 && (
              <span className="chip warn">🔄 Bị trả lại làm lại</span>
            )}
          </div>
        </div>

        {rejects.length > 0 && (
          <div className="exec-info-row">
            <div className="info-label">Lịch sử từ chối ({rejects.length} lần)</div>
            <div className="reject-list">
              {rejects.map((r, i) => (
                <div key={r.id} className="reject-item">
                  <div className="reject-head">
                    <strong>Lần {i + 1}</strong> · 🔄 Yêu cầu làm lại
                    {r.stepIds && r.stepIds.length > 0 && (
                      <span className="muted">
                        {' '}({r.stepIds.map((sid) => ex.steps.find((s) => s.id === sid)?.stepCode ?? sid).join(', ')})
                      </span>
                    )}
                  </div>
                  <div className="muted">👤 {r.actorName ?? '—'} · 🕐 {fmtDateTime(r.createdAt)}</div>
                  {r.reason && <div>Lý do: {r.reason}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="exec-info-row">
          <div className="info-label">Quy trình</div>
          <div className="info-value strong">{ex.processName} ({ex.processCode})</div>
        </div>

        {latestSubmit && (
          <div className="exec-info-row">
            <div className="info-label">Báo hoàn thành</div>
            <div className="info-value">📤 {latestSubmit.actorName ?? '—'} · {fmtDateTime(latestSubmit.createdAt)}</div>
          </div>
        )}

        {latestApprove && (
          <div className="exec-info-row">
            <div className="info-label">Xác nhận hoàn thành</div>
            <div className="info-value">✓ {latestApprove.actorName ?? '—'} · {fmtDateTime(latestApprove.createdAt)}</div>
          </div>
        )}

        {ex.executionDate && (
          <div className="exec-info-row">
            <div className="info-label">Ngày thực hiện (dự kiến)</div>
            <div className="info-value strong">
              {ex.executionDate}{ex.executionTime ? ` · ${ex.executionTime}` : ''}{ex.shift ? ` · Ca ${SHIFT_LABEL[ex.shift]}` : ''}
            </div>
          </div>
        )}

        <div className="exec-info-row">
          <div className="info-label">Bắt đầu lúc</div>
          <div className="info-value strong">{fmtDateTime(ex.startedAt)}</div>
        </div>

        <div className="exec-info-row">
          <div className="info-label">Người tạo</div>
          <div className="info-value strong">
            {ex.createdByName ?? '—'}{ex.createdByPositions ? ` — ${ex.createdByPositions}` : ''}
          </div>
        </div>

        <div className="exec-info-row">
          <div className="info-label">Người thực hiện chính</div>
          <div className="info-value strong">{ex.mainPerformerName ?? ex.createdByName ?? '—'}</div>
        </div>

        {approverName && (
          <div className="exec-info-row">
            <div className="info-label">Người duyệt</div>
            <div className="info-value strong">{approverName}</div>
          </div>
        )}

        {ex.orgUnitName && (
          <div className="exec-info-row">
            <div className="info-label">Đơn vị</div>
            <div className="info-value">{ex.orgUnitName}</div>
          </div>
        )}

        {ex.note && (
          <div className="exec-info-row">
            <div className="info-label">Ghi chú</div>
            <div className="info-value">📝 {ex.note}</div>
          </div>
        )}

        <div className="exec-info-row">
          <div className="info-label">Tiến độ</div>
          <div className="info-value">
            <div className="exec-progress-bar">
              <div className="exec-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="muted">{done}/{ex.steps.length} bước ({pct}%)</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="steps-head">
          <h3>Các bước ({ex.steps.length})</h3>
          <div className="seg-toggle" role="tablist" aria-label="Chế độ xem bước">
            <button
              type="button"
              role="tab"
              aria-selected={stepsView === 'list'}
              className={stepsView === 'list' ? 'active' : ''}
              onClick={() => setStepsView('list')}
            >
              Danh sách
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={stepsView === 'diagram'}
              className={stepsView === 'diagram' ? 'active' : ''}
              onClick={() => setStepsView('diagram')}
            >
              Sơ đồ
            </button>
          </div>
        </div>
        {stepsView === 'list' ? (
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
                blockedByOrder={ex.steps.some((p) => p.sortOrder < s.sortOrder && p.state !== 'DONE')}
                guide={guides[s.stepCode]}
                lastRedoReason={
                  ex.reviews.find((r) => r.action === 'reject' && r.stepIds?.includes(s.id))?.reason ?? null
                }
                onChanged={load}
              />
            ))}
          </div>
        ) : (
          <ProcessDiagram
            steps={
              ex.steps.map((s) => ({
                id: s.id,
                code: s.stepCode,
                title: s.title,
                sortOrder: s.sortOrder,
                required: s.required,
                skip: s.skip,
              })) as unknown as ProcessStepDto[]
            }
            openSteps={EMPTY_STEP_SET}
            onToggle={() => {}}
          />
        )}
      </section>

      {cancelOpen && (
        <div className="modal-backdrop" onClick={() => setCancelOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Hủy lượt {ex.code}?</h3>
            <p className="sec-desc">Hành động này không thể hoàn tác.</p>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setCancelOpen(false)}>← Hủy bỏ</button>
              <button type="button" className="btn-small danger" disabled={busy} onClick={() => runAction('cancel')}>
                {busy ? 'Đang xử lý…' : 'Xác nhận hủy'}
              </button>
            </div>
          </div>
        </div>
      )}
      {rejectOpen && (
        <div className="modal-backdrop" onClick={() => setRejectOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Từ chối xác nhận lượt {ex.code}</h3>
            <div className="field">
              <label className="check">
                <input
                  type="radio"
                  checked={rejectMode === 'all'}
                  onChange={() => setRejectMode('all')}
                />
                Trả toàn bộ lượt làm lại
              </label>
              <label className="check">
                <input
                  type="radio"
                  checked={rejectMode === 'steps'}
                  onChange={() => setRejectMode('steps')}
                />
                Chọn bước cần làm lại
              </label>
            </div>
            {rejectMode === 'steps' && (
              <div className="field">
                <label>Bước làm lại * (chọn ít nhất 1)</label>
                <div className="reject-steps">
                  {ex.steps.filter((s) => s.state === 'DONE').map((s) => (
                    <label key={s.id} className="check">
                      <input
                        type="checkbox"
                        checked={rejectStepIds.includes(s.id)}
                        onChange={(e) => setRejectStepIds((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )}
                      />
                      {s.stepCode} — {s.title}
                      {s.redoCount > 0 && <span className="muted"> (đã làm lại {s.redoCount} lần)</span>}
                    </label>
                  ))}
                  {ex.steps.filter((s) => s.state === 'DONE').length === 0 && (
                    <p className="sec-desc">Không có bước nào đã hoàn thành.</p>
                  )}
                </div>
              </div>
            )}
            <div className="field">
              <label>Lý do từ chối *</label>
              <textarea
                className="input"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ghi rõ lý do từ chối…"
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setRejectOpen(false)}>Hủy</button>
              <button
                type="button"
                className="btn-small danger"
                disabled={busy || !rejectReason.trim() || (rejectMode === 'steps' && rejectStepIds.length === 0)}
                onClick={doReject}
              >
                {busy ? 'Đang xử lý…' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
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
  onDone,
  onCancel,
}: {
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
  const [executionTime, setExecutionTime] = React.useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  });
  const [shift, setShift] = React.useState('');
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

  const valid = processId !== '' && versionId !== '' && executionDate !== '' && title.trim() !== '';

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const body: CreateExecutionBody = {
        processVersionId: versionId,
        title: title.trim(),
        executionDate: executionDate || null,
        executionTime: executionTime || null,
        shift: (shift || null) as ExecutionShift | null,
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
          <label>Tiêu đề lượt *</label>
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
