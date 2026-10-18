/**
 * Trang thống kê Ngoại lệ (T5) — liệt kê + thống kê theo trạng thái/mức độ.
 */
import React from 'react';
import type { ExceptionDto } from '@giangdc-sop/contracts';
import {
  EXCEPTION_SEVERITY_LABEL,
  EXCEPTION_STATUS_LABEL,
} from '@giangdc-sop/contracts';
import { api } from './App.js';

interface ExceptionItem extends ExceptionDto {
  executionCode: string;
}

export function ExceptionsView({ onOpenExecution }: { onOpenExecution: (id: string) => void }) {
  const [items, setItems] = React.useState<ExceptionItem[]>([]);
  const [stats, setStats] = React.useState<{
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
  }>({ total: 0, byStatus: {}, bySeverity: {} });
  const [status, setStatus] = React.useState('');
  const [severity, setSeverity] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (severity) params.set('severity', severity);
      const q = params.toString() ? `?${params}` : '';
      const d = (await api(`/exceptions${q}`)) as {
        items: ExceptionItem[];
        stats: { total: number; byStatus: Record<string, number>; bySeverity: Record<string, number> };
      };
      setItems(d.items ?? []);
      setStats(d.stats ?? { total: 0, byStatus: {}, bySeverity: {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [status, severity]);

  React.useEffect(() => { load(); }, [load]);

  if (loading) return <div className="empty">Đang tải…</div>;

  return (
    <div>
      <h2 className="page-title">⚠ Ngoại lệ</h2>
      <p className="page-sub">Thống kê ngoại lệ trên toàn hệ thống (T5, EXP-001..006).</p>
      {error && <div className="alert-error">{error}</div>}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-label">Tổng ngoại lệ</div>
        </div>
        {Object.entries(stats.byStatus).map(([s, c]) => (
          <div key={s} className="kpi-card" onClick={() => setStatus(s)} style={{ cursor: 'pointer' }}>
            <div className="kpi-value">{c}</div>
            <div className="kpi-label">{EXCEPTION_STATUS_LABEL[s as keyof typeof EXCEPTION_STATUS_LABEL] ?? s}</div>
          </div>
        ))}
      </div>

      <div className="kpi-grid">
        {Object.entries(stats.bySeverity).map(([s, c]) => (
          <div key={s} className={`kpi-card sev-${s.toLowerCase()}`} onClick={() => setSeverity(s)} style={{ cursor: 'pointer' }}>
            <div className="kpi-value">{c}</div>
            <div className="kpi-label">{EXCEPTION_SEVERITY_LABEL[s as keyof typeof EXCEPTION_SEVERITY_LABEL] ?? s}</div>
          </div>
        ))}
      </div>

      <div className="filter-row">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {Object.keys(EXCEPTION_STATUS_LABEL).map((s) => (
            <option key={s} value={s}>{EXCEPTION_STATUS_LABEL[s as keyof typeof EXCEPTION_STATUS_LABEL]}</option>
          ))}
        </select>
        <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Tất cả mức độ</option>
          {Object.keys(EXCEPTION_SEVERITY_LABEL).map((s) => (
            <option key={s} value={s}>{EXCEPTION_SEVERITY_LABEL[s as keyof typeof EXCEPTION_SEVERITY_LABEL]}</option>
          ))}
        </select>
        {(status || severity) && (
          <button type="button" className="btn-ghost" onClick={() => { setStatus(''); setSeverity(''); }}>
            Xóa lọc
          </button>
        )}
      </div>

      <div className="ex-list">
        {items.length === 0 ? (
          <div className="empty">Chưa có ngoại lệ.</div>
        ) : items.map((x) => (
          <div key={x.id} className={`ex-card sev-${x.severity.toLowerCase()}`}>
            <div className="ex-head">
              <span className={`chip sm sev-${x.severity.toLowerCase()}`}>{EXCEPTION_SEVERITY_LABEL[x.severity]}</span>
              <span className="chip sm muted">{EXCEPTION_STATUS_LABEL[x.status]}</span>
              <button type="button" className="link" onClick={() => onOpenExecution(x.executionId)}>
                {x.executionCode}
              </button>
              <strong>{x.stepCode}</strong>
            </div>
            <div className="ex-title">{x.title}</div>
            <div className="ex-meta">
              {x.createdByName ?? ''} · {new Date(x.createdAt).toLocaleString('vi-VN')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
