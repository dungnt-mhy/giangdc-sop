import React from 'react';
import type {
  ApprovalDecision,
  CompletionKind,
  ExceptionSeverity,
  ProcessDto,
  ProcessStepDto,
  ProcessVersionDto,
  ProcessVersionState,
  ReviewCommentDto,
  ApprovalRecordDto,
  UpsertStepBody,
  PositionDto,
  ValidationIssueDto,
} from '@giangdc-sop/contracts';
import { api } from './App.js';

const STATE_LABEL: Record<ProcessVersionState, string> = {
  DRAFT: 'Nháp',
  IN_REVIEW: 'Chờ thẩm định',
  APPROVED: 'Đã phê duyệt',
  SCHEDULED: 'Chờ hiệu lực',
  ACTIVE: 'Đang hiệu lực',
  SUPERSEDED: 'Đã thay thế',
  RETIRED: 'Ngừng dùng',
};

const FAILURE_LABEL: Record<string, string> = {
  STOP: 'Dừng',
  RETRY: 'Làm lại',
  ESCALATE: 'Chuyển giám sát',
  CANCEL: 'Hủy',
};

// Nhãn tiếng Việt cho loại yêu cầu hoàn thành = bằng chứng (PRC-006)
const COMP_KIND_LABEL: Record<string, string> = {
  PHOTO: 'Ảnh chụp',
  FILE: 'Tệp đính kèm',
  SCAN: 'Quét mã',
  CONFIRM: 'Xác nhận',
  FORM: 'Biểu mẫu',
  FIELD: 'Trường dữ liệu',
  NOTE: 'Ghi chú',
};

// Mã bước gợi ý tiếp theo: B01, B02, ... theo mã Bxx lớn nhất hiện có
function nextStepCode(steps: { code: string }[]): string {
  let max = 0;
  for (const s of steps) {
    const m = /^B(\d+)$/.exec((s.code ?? '').trim().toUpperCase());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'B' + String(max + 1).padStart(2, '0');
}

function can(perms: string[], p: string): boolean {
  return perms.includes(p);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Lỗi hệ thống.';
}

/** Ngày dd/mm/yyyy cho hiển thị. */
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN');
}

/**
 * Multi-select chức vụ dùng chung (thực hiện / giám sát) — D-09.
 * Danh mục lấy từ GET /positions (bảng positions).
 */
function PositionMultiSelect({
  label,
  hint,
  positions,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  positions: PositionDto[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select
        className="input"
        multiple
        value={value}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
      >
        {positions.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <p className="sec-desc">{hint}</p>
    </div>
  );
}

/** Nhãn tiếng Việt cho mảng chức vụ, cách nhau bởi dấu phẩy. */
function positionNames(arr: readonly PositionDto[] | undefined): string {
  if (!arr || arr.length === 0) return '—';
  return arr.map((p) => p.name).join(', ');
}

/** Nhãn tiếng Việt cho mảng id chức vụ được bỏ qua, cách nhau bởi dấu phẩy. */
function skipPositionNames(
  arr: readonly string[] | undefined,
  positions: readonly PositionDto[],
): string {
  if (!arr || arr.length === 0) return '—';
  return arr.map((id) => positions.find((p) => p.id === id)?.name ?? id).join(', ');
}

/** Chi tiết đầy đủ của một bước — dùng khi mở rộng dòng bước (collapsible). */
function StepDetail({ step: s, positions }: { step: ProcessStepDto; positions: PositionDto[] }) {
  const kv = (k: string, v: React.ReactNode) => (
    <div className="sd-row"><span className="sd-k">{k}</span><div className="sd-v">{v}</div></div>
  );
  return (
    <div className="step-detail">
      <div className="sd-grid">
        {kv('Chức vụ thực hiện', positionNames(s.performerPositions))}
        {kv('Chức vụ giám sát', positionNames(s.supervisorPositions))}
      </div>
      {s.prerequisites && kv('Điều kiện tiên quyết', s.prerequisites)}
      {s.inputs && kv('Đầu vào', s.inputs)}
      {s.outputs && kv('Đầu ra / bàn giao', s.outputs)}
      {s.instructions && kv('Hướng dẫn chi tiết', s.instructions)}
      {s.expectedResult && kv('Kết quả mong đợi', s.expectedResult)}
      {s.warnings && kv('Cảnh báo an toàn', `⚠ ${s.warnings}`)}
      {s.targetDurationMin != null && kv('Thời lượng mục tiêu', `${s.targetDurationMin} phút`)}
      {s.notes && kv('Ghi chú', s.notes)}
      {s.completion.length > 0 && kv('Yêu cầu hoàn thành (bằng chứng)',
        <span>{s.completion.map((c, i) => (
          <span className="perm-tag" key={i}>[{COMP_KIND_LABEL[c.kind] ?? c.kind}] {c.label}</span>
        ))}</span>)}
      {kv('Cho phép bỏ qua', s.skip.allowed ? `Có — chức vụ: ${skipPositionNames(s.skip.allowedPositions, positions)}` : 'Không')}
      {kv('Xử lý khi không đạt', FAILURE_LABEL[s.failurePolicy] ?? s.failurePolicy)}
    </div>
  );
}

/** Dòng bước collapsible: đầu dòng gọn, bấm "Chi tiết" mở rộng toàn bộ. */
function StepRowView({
  index,
  step,
  expanded,
  onToggle,
  ops,
  positions,
}: {
  index: number;
  step: ProcessStepDto;
  expanded: boolean;
  onToggle: () => void;
  ops?: React.ReactNode;
  positions: PositionDto[];
}) {
  return (
    <div className={`step-row${expanded ? ' open' : ''}`}>
      <div className="step-order">{index + 1}</div>
      <div className="step-main">
        <div className="step-head">
          <div className="step-title"><code>{step.code}</code> {step.title}</div>
          <div className="step-head-right">
            {step.required
              ? <span className="chip sm">Bắt buộc</span>
              : <span className="chip sm muted">Tùy chọn</span>}
            <button type="button" className="step-toggle" onClick={onToggle} aria-expanded={expanded}>
              Chi tiết {expanded ? '▴' : '▾'}
            </button>
          </div>
        </div>
        {ops && <div className="step-ops-row">{ops}</div>}
        {expanded && <StepDetail step={step} positions={positions} />}
      </div>
    </div>
  );
}

function idemKey(): string {
  return crypto.randomUUID();
}

async function mut(path: string, method: string, body: unknown, useIdem = false) {
  const headers: Record<string, string> = {};
  if (useIdem) headers['Idempotency-Key'] = idemKey();
  return api(path, { method, headers, body: JSON.stringify(body ?? {}) });
}

/* ---------------- Danh sách quy trình (PRC-002) ---------------- */

function ProcessList({
  perms,
  onOpen,
}: {
  perms: string[];
  onOpen: (id: string) => void;
}) {
  const [items, setItems] = React.useState<ProcessDto[]>([]);
  const [q, setQ] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ code: '', name: '', purpose: '', scope: '', processGroup: 'GENERAL' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      const d = (await api(`/processes?q=${encodeURIComponent(q)}&limit=50`)) as { items: ProcessDto[] };
      setItems(d.items);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [q]);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function create() {
    setError('');
    if (!form.code.trim() || !form.name.trim()) {
      setError('Nhập mã và tên quy trình.');
      return;
    }
    setBusy(true);
    try {
      const d = (await mut('/processes', 'POST', {
        code: form.code.trim(),
        name: form.name.trim(),
        purpose: form.purpose.trim() || undefined,
        scope: form.scope.trim() || undefined,
        processGroup: form.processGroup.trim() || 'GENERAL',
      }, true)) as { process: ProcessDto };
      setShowCreate(false);
      setForm({ code: '', name: '', purpose: '', scope: '', processGroup: 'GENERAL' });
      onOpen(d.process.id);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="proc-toolbar">
        <input
          className="input search"
          placeholder="Tìm theo mã, tên quy trình…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {can(perms, 'process.create') && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + Tạo quy trình
          </button>
        )}
      </div>
      {error && <div className="alert-error">{error}</div>}
      <div className="proc-list">
        {items.map((p) => (
          <button key={p.id} className="proc-card" onClick={() => onOpen(p.id)}>
            <div className="proc-code">{p.code}</div>
            <div className="proc-name">{p.name}</div>
            <div className="proc-meta">
              <span className="chip">{p.processGroup}</span>
              <span className={`chip ${p.status === 'ACTIVE' ? 'ok' : 'muted'}`}>
                {p.status === 'ACTIVE' ? 'Đang dùng' : 'Đã lưu trữ'}
              </span>
            </div>
            <div className="proc-creator">
              Người tạo: {p.createdByName ?? '—'} · Ngày tạo: {fmtDate(p.createdAt)}
            </div>
          </button>
        ))}
        {items.length === 0 && <div className="empty">Chưa có quy trình nào.</div>}
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Tạo quy trình mới</h3>
            <p className="sec-desc">Tạo quy trình kèm bản nháp đầu tiên (PRC-001).</p>
            <label>Mã quy trình *</label>
            <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="VD: QT-KHO-001" />
            <label>Tên quy trình *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Xuất hàng đến đại lý" />
            <label>Mục đích</label>
            <input className="input" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            <label>Phạm vi áp dụng</label>
            <input className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
            <label>Nhóm</label>
            <input className="input" value={form.processGroup} onChange={(e) => setForm({ ...form, processGroup: e.target.value })} />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowCreate(false)}>Hủy</button>
              <button className="btn-primary" onClick={create} disabled={busy}>
                {busy ? 'Đang tạo…' : 'Tạo quy trình'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Chi tiết quy trình + timeline phiên bản ---------------- */

function VersionBadge({ state }: { state: ProcessVersionState }) {
  return <span className={`vbadge st-${state.toLowerCase().replace('_', '-')}`}>{STATE_LABEL[state]}</span>;
}

function ProcessDetail({
  perms,
  processId,
  onBack,
  onEditVersion,
  onReviewVersion,
}: {
  perms: string[];
  processId: string;
  onBack: () => void;
  onEditVersion: (v: ProcessVersionDto) => void;
  onReviewVersion: (v: ProcessVersionDto) => void;
}) {
  const [process, setProcess] = React.useState<ProcessDto | null>(null);
  const [versions, setVersions] = React.useState<ProcessVersionDto[]>([]);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [showRelease, setShowRelease] = React.useState<ProcessVersionDto | null>(null);
  const [effectiveFrom, setEffectiveFrom] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      const p = (await api(`/processes/${processId}`)) as { process: ProcessDto };
      const v = (await api(`/processes/${processId}/versions`)) as { versions: ProcessVersionDto[] };
      setProcess(p.process);
      setVersions(v.versions);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [processId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function newVersion() {
    setBusy(true);
    setError('');
    try {
      const d = (await mut(`/processes/${processId}/versions`, 'POST', {}, true)) as {
        version: ProcessVersionDto;
      };
      onEditVersion(d.version);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function doRelease(v: ProcessVersionDto) {
    setBusy(true);
    setError('');
    try {
      const d = (await mut(`/versions/${v.id}/release`, 'POST', {
        effectiveFrom: effectiveFrom || null,
        expectedRevision: v.revision,
      }, true)) as { version: ProcessVersionDto };
      setShowRelease(null);
      setEffectiveFrom('');
      await load();
      onReviewVersion(d.version);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function activate(v: ProcessVersionDto) {
    setBusy(true);
    setError('');
    try {
      await mut(`/versions/${v.id}/activate`, 'POST', { expectedRevision: v.revision }, true);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function retire(v: ProcessVersionDto) {
    if (!window.confirm(`Ngừng dùng bản v${v.versionNo}? Lịch sử tra cứu vẫn giữ (GOV-007).`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/versions/${v.id}/retire`, { method: 'POST', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!process) return <div className="empty">{error || 'Đang tải…'}</div>;

  return (
    <div>
      <button className="btn-ghost" onClick={onBack}>← Danh sách</button>
      {error && <div className="alert-error">{error}</div>}
      <div className="proc-head">
        <div>
          <div className="proc-code big">{process.code}</div>
          <h2 className="page-title">{process.name}</h2>
          <p className="page-sub">
            {process.purpose || '—'} · Nhóm: {process.processGroup}
            {process.scope ? ` · Phạm vi: ${process.scope}` : ''}
          </p>
          <p className="page-sub">
            Người tạo: {process.createdByName ?? '—'} · Ngày tạo: {fmtDate(process.createdAt)}
          </p>
        </div>
        {can(perms, 'process.edit') && (
          <button className="btn-primary" onClick={newVersion} disabled={busy}>
            + Phiên bản mới
          </button>
        )}
      </div>

      <section className="section">
        <h3>Lịch sử phiên bản</h3>
        <div className="ver-timeline">
          {versions.map((v) => (
            <div className="ver-row" key={v.id}>
              <div className="ver-no">v{v.versionNo}</div>
              <div className="ver-main">
                <VersionBadge state={v.state} />
                <div className="ver-sum">{v.changeSummary || <span className="muted">Chưa có mô tả thay đổi</span>}</div>
                <div className="ver-meta">
                  Tạo {new Date(v.createdAt).toLocaleString('vi-VN')}
                  {v.effectiveFrom ? ` · Hiệu lực từ ${new Date(v.effectiveFrom).toLocaleString('vi-VN')}` : ''}
                </div>
              </div>
              <div className="ver-actions">
                {v.state === 'DRAFT' && can(perms, 'process.edit') && (
                  <button className="btn-small" onClick={() => onEditVersion(v)}>Soạn thảo</button>
                )}
                {(v.state === 'IN_REVIEW' || v.state === 'APPROVED' || v.state === 'SCHEDULED' || v.state === 'ACTIVE' || v.state === 'SUPERSEDED') && (
                  <button className="btn-small ghost" onClick={() => onReviewVersion(v)}>Xem</button>
                )}
                {v.state === 'APPROVED' && can(perms, 'process.publish') && (
                  <button className="btn-small primary" onClick={() => setShowRelease(v)} disabled={busy}>Phát hành</button>
                )}
                {v.state === 'SCHEDULED' && can(perms, 'process.publish') && (
                  <button className="btn-small primary" onClick={() => activate(v)} disabled={busy}>Kích hoạt</button>
                )}
                {v.state === 'SUPERSEDED' && can(perms, 'process.deprecate') && (
                  <button className="btn-small ghost" onClick={() => retire(v)} disabled={busy}>Ngừng dùng</button>
                )}
              </div>
            </div>
          ))}
          {versions.length === 0 && <div className="empty">Chưa có phiên bản.</div>}
        </div>
      </section>

      {showRelease && (
        <div className="modal-backdrop" onClick={() => setShowRelease(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Phát hành bản v{showRelease.versionNo}</h3>
            <p className="sec-desc">
              Bỏ trống để phát hành ngay, hoặc chọn thời điểm hiệu lực trong tương lai
              (bản đi qua SCHEDULED — GOV-005).
            </p>
            <label>Thời điểm hiệu lực (tùy chọn)</label>
            <input
              className="input"
              type="datetime-local"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowRelease(null)}>Hủy</button>
              <button className="btn-primary" onClick={() => doRelease(showRelease)} disabled={busy}>
                {busy ? 'Đang phát hành…' : 'Phát hành'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Form bước (đủ 12 trường PRC-005 + PRC-006/007/008) ---------------- */

const EMPTY_STEP: UpsertStepBody = {
  code: '',
  title: '',
  performerPositionIds: [],
  supervisorPositionIds: [],
  required: true,
  failurePolicy: 'STOP',
  completion: [],
  skip: { allowed: false, allowedPositions: [], reasonRequired: true, approvalLevel: null },
};

function StepForm({
  initial,
  positions,
  onSave,
  onCancel,
  busy,
}: {
  initial: UpsertStepBody;
  positions: PositionDto[];
  onSave: (b: UpsertStepBody) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [f, setF] = React.useState<UpsertStepBody>({ ...EMPTY_STEP, ...initial });
  const [compLabel, setCompLabel] = React.useState('');
  const [compKind, setCompKind] = React.useState<CompletionKind>('PHOTO');
  const [ferr, setFerr] = React.useState('');
  const set = (k: keyof UpsertStepBody, v: unknown) =>
    setF((prev) => ({ ...prev, [k]: v }) as UpsertStepBody);

  const addCompletion = () => {
    const label = compLabel.trim();
    if (!label) return;
    setF((prev) => ({
      ...prev,
      completion: [...(prev.completion ?? []), { kind: compKind, label, required: true }],
    }));
    setCompLabel('');
  };

  /** Validate client-side + hiện lỗi ngay trong modal (kể cả lỗi server). */
  async function doSave() {
    setFerr('');
    if (!f.code.trim()) {
      setFerr('Nhập mã bước (VD: B01).');
      return;
    }
    if (!f.title.trim()) {
      setFerr('Nhập tiêu đề hành động của bước.');
      return;
    }
    try {
      await onSave(f);
    } catch (e) {
      setFerr(errMsg(e));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{initial.code ? 'Sửa bước' : 'Thêm bước'}</h3>
        {ferr && <div className="form-error">{ferr}</div>}
        <div className="field">
          <label>Mã bước *</label>
          <input className="input" value={f.code} onChange={(e) => { set('code', e.target.value); setFerr(''); }} placeholder="B01" />
        </div>
        <PositionMultiSelect
          label="Chức vụ thực hiện"
          hint="Chạm để chọn/bỏ chọn từng chức vụ (giữ Ctrl trên máy tính để chọn nhiều)."
          positions={positions}
          value={f.performerPositionIds ?? []}
          onChange={(v) => set('performerPositionIds', v)}
        />
        <PositionMultiSelect
          label="Chức vụ giám sát"
          hint="Chức vụ giám sát việc thực hiện bước này. Chạm để chọn/bỏ chọn từng chức vụ."
          positions={positions}
          value={f.supervisorPositionIds ?? []}
          onChange={(v) => set('supervisorPositionIds', v)}
        />
        <div className="field">
          <label>Tiêu đề hành động *</label>
          <input className="input" value={f.title} onChange={(e) => { set('title', e.target.value); setFerr(''); }} placeholder="VD: Kiểm tra số khung số máy" />
        </div>
        <div className="field">
          <label>Điều kiện tiên quyết</label>
          <input className="input" value={f.prerequisites ?? ''} onChange={(e) => set('prerequisites', e.target.value)} placeholder="VD: Hoàn thành bước B01" />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Đầu vào</label>
            <input className="input" value={f.inputs ?? ''} onChange={(e) => set('inputs', e.target.value)} placeholder="VD: Phiếu nhập kho" />
          </div>
          <div className="field">
            <label>Đầu ra / bàn giao</label>
            <input className="input" value={f.outputs ?? ''} onChange={(e) => set('outputs', e.target.value)} placeholder="VD: Hàng đã kiểm đếm" />
          </div>
        </div>
        <div className="field">
          <label>Hướng dẫn chi tiết</label>
          <textarea className="input" rows={3} value={f.instructions ?? ''} onChange={(e) => set('instructions', e.target.value)} placeholder="Các thao tác cần làm theo thứ tự…" />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Kết quả mong đợi</label>
            <input className="input" value={f.expectedResult ?? ''} onChange={(e) => set('expectedResult', e.target.value)} />
          </div>
          <div className="field">
            <label>Thời lượng mục tiêu (phút)</label>
            <input className="input" type="number" min={0} value={f.targetDurationMin ?? ''} onChange={(e) => set('targetDurationMin', e.target.value ? Number(e.target.value) : null)} />
          </div>
        </div>
        <div className="field">
          <label>Ghi chú</label>
          <input className="input" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </div>
        <div className="field">
          <label>Cảnh báo an toàn</label>
          <input className="input" value={f.warnings ?? ''} onChange={(e) => set('warnings', e.target.value)} placeholder="VD: Mang găng tay khi bốc xếp" />
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="check"><input type="checkbox" checked={f.required !== false} onChange={(e) => set('required', e.target.checked)} /> Bước bắt buộc</label>
          </div>
          <div className="field">
            <label>Hướng xử lý khi không đạt (PRC-008)</label>
            <select className="input" value={f.failurePolicy ?? 'STOP'} onChange={(e) => set('failurePolicy', e.target.value)}>
              {Object.entries(FAILURE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <h4>Yêu cầu hoàn thành = bằng chứng (PRC-006)</h4>
        <p className="sec-desc">Bằng chứng người thực hiện phải nộp để được tính là xong bước.</p>
        <div className="inline-add">
          <select className="input kind" value={compKind} onChange={(e) => setCompKind(e.target.value as CompletionKind)} aria-label="Loại bằng chứng">
            {Object.entries(COMP_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="input" value={compLabel} onChange={(e) => setCompLabel(e.target.value)} placeholder="VD: Ảnh chụp số khung" />
          <button type="button" className="btn-small" onClick={addCompletion}>+ Thêm</button>
        </div>
        <div className="tag-list">
          {(f.completion ?? []).map((c, i) => (
            <span className="perm-tag" key={i}>[{COMP_KIND_LABEL[c.kind] ?? c.kind}] {c.label}
              <button type="button" className="tag-x" onClick={() => setF((prev) => ({ ...prev, completion: (prev.completion ?? []).filter((_, j) => j !== i) }))}>×</button>
            </span>
          ))}
        </div>

        <h4>Cho phép bỏ qua (PRC-007)</h4>
        <label className="check"><input type="checkbox" checked={!!f.skip?.allowed} onChange={(e) => set('skip', { ...(f.skip ?? EMPTY_STEP.skip!), allowed: e.target.checked })} /> Cho phép bỏ qua bước này</label>
        {f.skip?.allowed && (
          <PositionMultiSelect
            label="Chức vụ được bỏ qua"
            hint="Chạm để chọn/bỏ chọn từng chức vụ (giữ Ctrl trên máy tính để chọn nhiều)."
            positions={positions}
            value={f.skip.allowedPositions ?? []}
            onChange={(v) => set('skip', { ...f.skip!, allowedPositions: v })}
          />
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Hủy</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={doSave}>{busy ? 'Đang lưu…' : 'Lưu bước'}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Trình soạn thảo bản nháp ---------------- */

function VersionEditor({
  version,
  onBack,
  onSubmitted,
}: {
  version: ProcessVersionDto;
  onBack: () => void;
  onSubmitted: (v: ProcessVersionDto) => void;
}) {
  const [v, setV] = React.useState(version);
  const [steps, setSteps] = React.useState<ProcessStepDto[]>([]);
  const [positions, setPositions] = React.useState<PositionDto[]>([]);
  const [editing, setEditing] = React.useState<UpsertStepBody | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [openSteps, setOpenSteps] = React.useState<Set<string>>(new Set());
  const [issues, setIssues] = React.useState<ValidationIssueDto[]>([]);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [showSubmit, setShowSubmit] = React.useState(false);
  const [summary, setSummary] = React.useState('');
  const [size, setSize] = React.useState<'MINOR' | 'MAJOR'>('MINOR');
  const [impact, setImpact] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      const d = (await api(`/versions/${v.id}`)) as { version: ProcessVersionDto; steps: ProcessStepDto[] };
      setV(d.version);
      setSteps(d.steps);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [v.id]);

  React.useEffect(() => { load(); }, [load]);

  // Danh mục chức vụ (D-09) cho form bước.
  React.useEffect(() => {
    api('/positions')
      .then((d) => setPositions((d as { items: PositionDto[] }).items ?? []))
      .catch(() => setPositions([]));
  }, []);

  async function saveStep(body: UpsertStepBody) {
    setBusy(true);
    setError('');
    try {
      if (editId) {
        await api(`/versions/${v.id}/steps/${editId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api(`/versions/${v.id}/steps`, { method: 'POST', body: JSON.stringify(body) });
      }
      setEditing(null);
      setEditId(null);
      await load();
    } catch (e) {
      setError(errMsg(e));
      throw e; // để StepForm bắt và hiện lỗi ngay trong modal (YC2)
    } finally {
      setBusy(false);
    }
  }

  const toggleStep = (id: string) =>
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function delStep(id: string) {
    if (!window.confirm('Xóa bước này khỏi bản nháp?')) return;
    try {
      await api(`/versions/${v.id}/steps/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = steps.findIndex((s) => s.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= steps.length) return;
    const order = steps.map((s) => s.id);
    [order[idx], order[j]] = [order[j], order[idx]];
    try {
      const d = (await api(`/versions/${v.id}/steps/reorder`, { method: 'POST', body: JSON.stringify({ order }) })) as { steps: ProcessStepDto[] };
      setSteps(d.steps);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function validate() {
    setError('');
    try {
      const d = (await api(`/versions/${v.id}/validate`, { method: 'POST', body: JSON.stringify({}) })) as { valid: boolean; issues: ValidationIssueDto[] };
      setIssues(d.issues);
      if (d.valid) setError('');
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const d = (await mut(`/versions/${v.id}/submit`, 'POST', {
        changeSummary: summary,
        changeSize: size,
        impactAssessment: impact || null,
        expectedRevision: v.revision,
      }, true)) as { version: ProcessVersionDto };
      setShowSubmit(false);
      onSubmitted(d.version);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'VALIDATION_FAILED') {
        setShowSubmit(false);
        await validate();
        setError('Bản nháp chưa đạt — xem danh sách lỗi bên dưới.');
      } else {
        setError(errMsg(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn-ghost" onClick={onBack}>← Quay lại</button>
      {error && <div className="alert-error">{error}</div>}
      <div className="proc-head">
        <div>
          <div className="proc-code big">Bản v{v.versionNo}</div>
          <h2 className="page-title">Soạn thảo bản nháp</h2>
        </div>
        <div className="ver-actions">
          <button className="btn-small ghost" onClick={validate}>Kiểm tra bản nháp</button>
          <button className="btn-small primary" onClick={() => { setSummary(v.changeSummary ?? ''); setShowSubmit(true); }}>Gửi thẩm định</button>
        </div>
      </div>

      {issues.length > 0 && (
        <section className="section">
          <h3>Lỗi kiểm tra ({issues.length})</h3>
          <ul className="issue-list">
            {issues.map((i, k) => (
              <li key={k}><code>{i.stepCode ?? '—'}</code> · <code>{i.field}</code> — {i.message}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="sec-head">
          <h3>Các bước ({steps.length})</h3>
          <button className="btn-small primary" onClick={() => { setEditing({ ...EMPTY_STEP, code: nextStepCode(steps) }); setEditId(null); }}>+ Thêm bước</button>
        </div>
        <div className="step-list">
          {steps.map((s, i) => (
            <StepRowView
              key={s.id}
              index={i}
              step={s}
              expanded={openSteps.has(s.id)}
              onToggle={() => toggleStep(s.id)}
              positions={positions}
              ops={
                <>
                  <button className="btn-icon" title="Lên" onClick={() => move(s.id, -1)}>↑</button>
                  <button className="btn-icon" title="Xuống" onClick={() => move(s.id, 1)}>↓</button>
                  <button className="btn-icon" title="Sửa" onClick={() => {
                    setEditing({
                      code: s.code, title: s.title, prerequisites: s.prerequisites, inputs: s.inputs,
                      instructions: s.instructions, expectedResult: s.expectedResult, outputs: s.outputs,
                      notes: s.notes,
                      performerPositionIds: (s.performerPositions ?? []).map((p) => p.id),
                      supervisorPositionIds: (s.supervisorPositions ?? []).map((p) => p.id),
                      required: s.required, targetDurationMin: s.targetDurationMin,
                      warnings: s.warnings, completion: s.completion, skip: s.skip, failurePolicy: s.failurePolicy,
                    });
                    setEditId(s.id);
                  }}>✎</button>
                  <button className="btn-icon danger" title="Xóa" onClick={() => delStep(s.id)}>×</button>
                </>
              }
            />
          ))}
          {steps.length === 0 && <div className="empty">Chưa có bước nào — thêm bước đầu tiên.</div>}
        </div>
      </section>

      {editing && (
        <StepForm initial={editing} positions={positions} busy={busy} onCancel={() => { setEditing(null); setEditId(null); }} onSave={saveStep} />
      )}

      {showSubmit && (
        <div className="modal-backdrop" onClick={() => setShowSubmit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Gửi thẩm định</h3>
            <p className="sec-desc">Gửi đi sẽ khóa sửa nội dung bản nháp (GOV-001).</p>
            <label>Nội dung thay đổi * (BR-003)</label>
            <textarea className="input" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Mô tả ngắn gọn nội dung thay đổi của bản này" />
            <label>Mức thay đổi</label>
            <select className="input" value={size} onChange={(e) => setSize(e.target.value as 'MINOR' | 'MAJOR')}>
              <option value="MINOR">Nhỏ</option>
              <option value="MAJOR">Lớn (cần đánh giá tác động)</option>
            </select>
            {size === 'MAJOR' && (
              <><label>Đánh giá tác động *</label>
              <textarea className="input" rows={3} value={impact} onChange={(e) => setImpact(e.target.value)} /></>
            )}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowSubmit(false)}>Hủy</button>
              <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi thẩm định'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Thẩm định / phê duyệt / phát hành ---------------- */

function VersionReview({
  version,
  perms,
  onBack,
  onChanged,
}: {
  version: ProcessVersionDto;
  perms: string[];
  onBack: () => void;
  onChanged: (v: ProcessVersionDto) => void;
}) {
  const [v, setV] = React.useState(version);
  const [steps, setSteps] = React.useState<ProcessStepDto[]>([]);
  const [comments, setComments] = React.useState<ReviewCommentDto[]>([]);
  const [approvals, setApprovals] = React.useState<ApprovalRecordDto[]>([]);
  const [positions, setPositions] = React.useState<PositionDto[]>([]);
  React.useEffect(() => {
    api('/positions')
      .then((d) => setPositions((d as { items: PositionDto[] }).items ?? []))
      .catch(() => setPositions([]));
  }, []);
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [showReturn, setShowReturn] = React.useState(false);
  const [returnReason, setReturnReason] = React.useState('');
  const [showApprove, setShowApprove] = React.useState(false);
  const [decision, setDecision] = React.useState<ApprovalDecision>('APPROVED');
  const [severity, setSeverity] = React.useState<ExceptionSeverity>('MEDIUM');
  const [approveReason, setApproveReason] = React.useState('');
  const [openSteps, setOpenSteps] = React.useState<Set<string>>(new Set());
  const toggleStep = (id: string) =>
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const load = React.useCallback(async () => {
    try {
      const d = (await api(`/versions/${v.id}`)) as {
        version: ProcessVersionDto; steps: ProcessStepDto[];
        comments: ReviewCommentDto[]; approvals: ApprovalRecordDto[];
      };
      setV(d.version);
      setSteps(d.steps);
      setComments(d.comments);
      setApprovals(d.approvals);
      onChanged(d.version);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [v.id]);

  React.useEffect(() => { load(); }, [load]);

  async function addComment() {
    if (!comment.trim()) return;
    setBusy(true);
    setError('');
    try {
      const d = (await api(`/versions/${v.id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment.trim() }) })) as { comments: ReviewCommentDto[] };
      setComments(d.comments);
      setComment('');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function doReturn() {
    if (!returnReason.trim()) { setError('Nhập lý do trả sửa.'); return; }
    setBusy(true);
    setError('');
    try {
      const d = (await api(`/versions/${v.id}/return`, { method: 'POST', body: JSON.stringify({ reason: returnReason.trim(), expectedRevision: v.revision }) })) as { version: ProcessVersionDto };
      setShowReturn(false);
      setReturnReason('');
      setV(d.version);
      onChanged(d.version);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function doApprove() {
    setBusy(true);
    setError('');
    try {
      const d = (await mut(`/versions/${v.id}/approve`, 'POST', {
        decision,
        severity: decision === 'APPROVED' ? severity : undefined,
        reason: approveReason.trim() || undefined,
        expectedRevision: v.revision,
      }, true)) as { version: ProcessVersionDto };
      setShowApprove(false);
      setApproveReason('');
      setV(d.version);
      onChanged(d.version);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn-ghost" onClick={onBack}>← Quay lại</button>
      {error && <div className="alert-error">{error}</div>}
      <div className="proc-head">
        <div>
          <div className="proc-code big">Bản v{v.versionNo}</div>
          <h2 className="page-title"><VersionBadge state={v.state} /></h2>
          <p className="page-sub">{v.changeSummary || '—'}{v.changeSize ? ` · Mức: ${v.changeSize === 'MAJOR' ? 'Lớn' : 'Nhỏ'}` : ''}</p>
        </div>
        <div className="ver-actions">
          {v.state === 'IN_REVIEW' && can(perms, 'process.review') && (
            <button className="btn-small ghost" onClick={() => setShowReturn(true)}>Trả sửa</button>
          )}
          {v.state === 'IN_REVIEW' && can(perms, 'process.approve') && (
            <button className="btn-small primary" onClick={() => setShowApprove(true)}>Phê duyệt</button>
          )}
        </div>
      </div>

      <section className="section">
        <h3>Các bước ({steps.length})</h3>
        <div className="step-list">
          {steps.map((s, i) => (
            <StepRowView
              key={s.id}
              index={i}
              step={s}
              expanded={openSteps.has(s.id)}
              onToggle={() => toggleStep(s.id)}
              positions={positions}
            />
          ))}
        </div>
      </section>

      <section className="section">
        <h3>Góp ý thẩm định ({comments.length})</h3>
        <div className="comment-list">
          {comments.map((cm) => (
            <div className="comment" key={cm.id}>
              <div className="comment-head"><strong>{cm.authorName}</strong>{cm.stepCode && <code>{cm.stepCode}</code>}<span className="muted">{new Date(cm.createdAt).toLocaleString('vi-VN')}</span></div>
              <div>{cm.body}</div>
            </div>
          ))}
          {comments.length === 0 && <div className="empty">Chưa có góp ý.</div>}
        </div>
        {can(perms, 'process.review') && (
          <div className="inline-add">
            <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Viết góp ý…" />
            <button className="btn-small" onClick={addComment} disabled={busy}>Gửi</button>
          </div>
        )}
      </section>

      <section className="section">
        <h3>Lịch sử phê duyệt</h3>
        <div className="comment-list">
          {approvals.map((a) => (
            <div className="comment" key={a.id}>
              <div className="comment-head">
                <strong>{a.approverName}</strong>
                <span className={`chip ${a.decision === 'APPROVED' ? 'ok' : 'warn'}`}>
                  {a.decision === 'APPROVED' ? 'Đã duyệt' : a.decision === 'REJECTED' ? 'Từ chối' : 'Trả sửa'}
                </span>
                {a.flagged && <span className="chip warn">Tự duyệt — có gắn cờ</span>}
                <span className="muted">{new Date(a.createdAt).toLocaleString('vi-VN')}</span>
              </div>
              {a.reason && <div>Lý do: {a.reason}</div>}
            </div>
          ))}
          {approvals.length === 0 && <div className="empty">Chưa có lượt phê duyệt.</div>}
        </div>
      </section>

      {showReturn && (
        <div className="modal-backdrop" onClick={() => setShowReturn(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Trả sửa bản v{v.versionNo}</h3>
            <p className="sec-desc">Bản về lại DRAFT, toàn bộ lịch sử góp ý được giữ (GOV-003).</p>
            <label>Lý do trả sửa *</label>
            <textarea className="input" rows={3} value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowReturn(false)}>Hủy</button>
              <button className="btn-primary" onClick={doReturn} disabled={busy}>{busy ? 'Đang trả…' : 'Trả sửa'}</button>
            </div>
          </div>
        </div>
      )}

      {showApprove && (
        <div className="modal-backdrop" onClick={() => setShowApprove(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Phê duyệt bản v{v.versionNo}</h3>
            <label>Quyết định</label>
            <select className="input" value={decision} onChange={(e) => setDecision(e.target.value as ApprovalDecision)}>
              <option value="APPROVED">Phê duyệt</option>
              <option value="REJECTED">Từ chối (về DRAFT)</option>
            </select>
            {decision === 'APPROVED' && (
              <><label>Mức nghiêm trọng (quyết định cấp phê duyệt — D-08)</label>
              <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as ExceptionSeverity)}>
                <option value="LOW">Thấp — người phê duyệt/quản lý/admin</option>
                <option value="MEDIUM">Trung bình — người phê duyệt/quản lý/admin</option>
                <option value="HIGH">Cao — quản lý trở lên</option>
                <option value="BLOCKING">Nghiêm trọng — quản lý/admin + bắt buộc lý do</option>
              </select></>
            )}
            <label>Lý do {(severity === 'HIGH' || severity === 'BLOCKING') && decision === 'APPROVED' ? '*' : '(tùy chọn)'}</label>
            <textarea className="input" rows={2} value={approveReason} onChange={(e) => setApproveReason(e.target.value)} />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowApprove(false)}>Hủy</button>
              <button className="btn-primary" onClick={doApprove} disabled={busy}>{busy ? 'Đang xử lý…' : 'Xác nhận'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Container phân hệ ---------------- */

type ProcView =
  | { name: 'list' }
  | { name: 'detail'; processId: string }
  | { name: 'edit'; version: ProcessVersionDto; processId: string }
  | { name: 'review'; version: ProcessVersionDto; processId: string };

export function ProcessesView({ perms }: { perms: string[] }) {
  const [view, setView] = React.useState<ProcView>({ name: 'list' });

  return (
    <div>
      <header className="topbar">
        <div>
          <div className="crumb">Trang chủ <span> / </span> <strong>Danh mục Quy trình</strong></div>
          <h2 className="page-title">Danh mục Quy trình</h2>
          <p className="page-sub">Soạn thảo, thẩm định, phê duyệt và phát hành phiên bản (T2).</p>
        </div>
        <div className="topbar-right"><span className="env-badge">DEMO</span></div>
      </header>

      {view.name === 'list' && (
        <ProcessList perms={perms} onOpen={(id) => setView({ name: 'detail', processId: id })} />
      )}
      {view.name === 'detail' && (
        <ProcessDetail
          perms={perms}
          processId={view.processId}
          onBack={() => setView({ name: 'list' })}
          onEditVersion={(v) => setView({ name: 'edit', version: v, processId: view.processId })}
          onReviewVersion={(v) => setView({ name: 'review', version: v, processId: view.processId })}
        />
      )}
      {view.name === 'edit' && (
        <VersionEditor
          version={view.version}
          onBack={() => setView({ name: 'detail', processId: view.processId })}
          onSubmitted={(v) => setView({ name: 'review', version: v, processId: view.processId })}
        />
      )}
      {view.name === 'review' && (
        <VersionReview
          version={view.version}
          perms={perms}
          onBack={() => setView({ name: 'detail', processId: view.processId })}
          onChanged={(v) => setView({ name: 'review', version: v, processId: view.processId })}
        />
      )}
    </div>
  );
}
