/**
 * T6 — Báo cáo/KPI (RPT-001..006).
 * Bộ lọc + thẻ KPI (giá trị, định nghĩa, N/A) + Xuất CSV + drill-down.
 */
import React from 'react';
import type {
  ExecutionDto,
  ExecutionState,
  KpiReport,
  ProcessDto,
} from '@giangdc-sop/contracts';
import { api, API_BASE } from './App.js';
import { EXEC_STATE_LABEL } from './executions.js';
import { setHash } from './hashRoute.js';

const STATE_OPTIONS: ExecutionState[] = [
  'CREATED',
  'IN_PROGRESS',
  'PAUSED',
  'BLOCKED',
  'COMPLETED',
  'PENDING_APPROVAL',
  'APPROVED',
  'CANCELLED',
];

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Lỗi hệ thống.';
}

function fmtPct(v: number | null): string {
  if (v === null || v === undefined) return 'N/A';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtHours(v: number | null): string {
  if (v === null || v === undefined) return 'N/A';
  return `${v.toFixed(1)} giờ`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN');
}

function buildQuery(f: { from: string; to: string; processId: string; state: string }): string {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.processId) p.set('processId', f.processId);
  if (f.state) p.set('state', f.state);
  return p.toString();
}

export function ReportsView() {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [processId, setProcessId] = React.useState('');
  const [state, setState] = React.useState('');
  const [processes, setProcesses] = React.useState<ProcessDto[]>([]);
  const [report, setReport] = React.useState<KpiReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [exporting, setExporting] = React.useState(false);
  // Drill-down: tiêu đề + danh sách id đang mở.
  const [drillTitle, setDrillTitle] = React.useState('');
  const [drillIds, setDrillIds] = React.useState<string[]>([]);
  const [drillItems, setDrillItems] = React.useState<ExecutionDto[]>([]);
  const [drillLoading, setDrillLoading] = React.useState(false);

  React.useEffect(() => {
    api('/processes?limit=100')
      .then((d) => setProcesses((d as { items: ProcessDto[] }).items ?? []))
      .catch(() => setProcesses([]));
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = buildQuery({ from, to, processId, state });
      const d = (await api(`/reports/kpi${q ? `?${q}` : ''}`)) as { report: KpiReport };
      setReport(d.report);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, processId, state]);

  React.useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const q = buildQuery({ from, to, processId, state });
      const res = await fetch(`${API_BASE}/executions/export${q ? `?${q}` : ''}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Xuất CSV thất bại.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bao-cao-luot-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setExporting(false);
    }
  };

  const openDrillDown = async (title: string, ids: string[]) => {
    setDrillTitle(title);
    setDrillIds(ids);
    setDrillItems([]);
    if (ids.length === 0) return;
    setDrillLoading(true);
    try {
      const d = (await api(`/executions?ids=${ids.join(',')}`)) as { items: ExecutionDto[] };
      setDrillItems(d.items ?? []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setDrillLoading(false);
    }
  };

  const kpiCard = (
    key: string,
    title: string,
    display: string,
    definition: string,
    sub: string,
    ids: string[],
  ) => (
    <button
      type="button"
      key={key}
      className="kpi-card"
      title={definition}
      onClick={() => openDrillDown(title, ids)}
    >
      <div className="kpi-title">{title}</div>
      <div className={`kpi-value${display === 'N/A' ? ' na' : ''}`}>{display}</div>
      <div className="kpi-sub">{sub}</div>
      <div className="kpi-def">{definition}</div>
      {ids.length > 0 && <div className="kpi-drill">Nhấn để xem {ids.length} lượt →</div>}
    </button>
  );

  return (
    <div>
      <div className="sec-head">
        <h3>📊 Báo cáo</h3>
        <button type="button" className="btn-small primary" disabled={exporting} onClick={exportCsv}>
          {exporting ? 'Đang xuất…' : '⬇ Xuất CSV'}
        </button>
      </div>

      <div className="filter-row">
        <label className="filter-field">
          <span>Từ ngày</span>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="filter-field">
          <span>Đến ngày</span>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="filter-field">
          <span>Quy trình</span>
          <select className="input" value={processId} onChange={(e) => setProcessId(e.target.value)}>
            <option value="">Tất cả</option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Trạng thái</span>
          <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Tất cả</option>
            {STATE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {EXEC_STATE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="empty">Đang tải…</div>
      ) : report ? (
        <>
          <div className="kpi-grid">
            <div className="kpi-card static">
              <div className="kpi-title">Tổng số lượt</div>
              <div className="kpi-value">{report.total}</div>
              <div className="kpi-sub">Khớp bộ lọc hiện tại</div>
              <div className="kpi-bystates">
                {(Object.keys(report.byState) as ExecutionState[]).map((s) => (
                  <span key={s} className="chip sm">
                    {EXEC_STATE_LABEL[s]}: {report.byState[s]}
                  </span>
                ))}
              </div>
            </div>
            {kpiCard(
              'completion',
              'Tỷ lệ hoàn thành bước',
              fmtPct(report.completionRate.value),
              report.completionRate.definition,
              `${report.completionRate.numerator}/${report.completionRate.denominator} bước bắt buộc`,
              report.completionRate.executionIds,
            )}
            {kpiCard(
              'ontime',
              'Tỷ lệ đúng hạn',
              fmtPct(report.onTimeRate.value),
              report.onTimeRate.definition,
              report.onTimeRate.denominator > 0
                ? `${report.onTimeRate.numerator}/${report.onTimeRate.denominator} lượt`
                : 'Chưa có dữ liệu hạn hoàn thành',
              report.onTimeRate.executionIds,
            )}
            {kpiCard(
              'evidence',
              'Đủ bằng chứng',
              fmtPct(report.evidenceCompleteness.value),
              report.evidenceCompleteness.definition,
              `${report.evidenceCompleteness.numerator}/${report.evidenceCompleteness.denominator} bước yêu cầu ảnh`,
              report.evidenceCompleteness.executionIds,
            )}
            {kpiCard(
              'rft',
              'Đúng ngay lần đầu',
              fmtPct(report.rightFirstTime.value),
              report.rightFirstTime.definition,
              `${report.rightFirstTime.numerator}/${report.rightFirstTime.denominator} lượt hoàn thành`,
              report.rightFirstTime.executionIds,
            )}
            {kpiCard(
              'cycle',
              'Thời gian chu kỳ',
              `${fmtHours(report.cycleTime.medianHours)} / ${fmtHours(report.cycleTime.p95Hours)}`,
              report.cycleTime.definition,
              `Median / P95 trên ${report.cycleTime.count} lượt`,
              report.cycleTime.executionIds,
            )}
          </div>
          <p className="muted small">
            Dữ liệu tính lúc {fmtDateTime(report.dataTime)}
            {report.filters.from || report.filters.to || report.filters.processId || report.filters.state
              ? ' · Bộ lọc: ' +
                [
                  report.filters.from ? `từ ${report.filters.from}` : '',
                  report.filters.to ? `đến ${report.filters.to}` : '',
                  report.filters.processId
                    ? `quy trình ${processes.find((p) => p.id === report.filters.processId)?.code ?? report.filters.processId}`
                    : '',
                  report.filters.state ? EXEC_STATE_LABEL[report.filters.state] : '',
                ]
                  .filter(Boolean)
                  .join(', ')
              : ' · Không lọc'}
            .
          </p>
        </>
      ) : null}

      {/* Drill-down: popup trong app (không dùng dialog trình duyệt). */}
      {drillTitle && (
        <div className="modal-backdrop" onClick={() => { setDrillTitle(''); setDrillIds([]); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h4>{drillTitle}</h4>
              <button
                type="button"
                className="btn-small"
                onClick={() => { setDrillTitle(''); setDrillIds([]); }}
              >
                ✕
              </button>
            </div>
            {drillLoading ? (
              <div className="empty">Đang tải…</div>
            ) : drillItems.length === 0 ? (
              <div className="empty">Không có lượt nào.</div>
            ) : (
              <div className="drill-list">
                {drillItems.map((ex) => (
                  <button
                    type="button"
                    key={ex.id}
                    className="drill-item"
                    onClick={() => {
                      setDrillTitle('');
                      setDrillIds([]);
                      setHash(`#/executions/${ex.id}`);
                    }}
                  >
                    <code>{ex.code}</code>
                    <span className="drill-item-title">{ex.title || ex.processName}</span>
                    <span className="chip sm">{EXEC_STATE_LABEL[ex.state]}</span>
                  </button>
                ))}
              </div>
            )}
            {drillIds.length > drillItems.length && (
              <p className="muted small">Hiển thị {drillItems.length}/{drillIds.length} lượt (giới hạn 50).</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
