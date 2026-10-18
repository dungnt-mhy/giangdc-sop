/**
 * Trang thống kê Bằng chứng (T4) — liệt kê + thống kê theo loại trên toàn hệ thống.
 */
import React from 'react';
import type { EvidenceDto } from '@giangdc-sop/contracts';
import { api } from './App.js';

const KIND_LABEL: Record<string, string> = {
  FIELD: '📝 Trường dữ liệu',
  FORM: '📋 Biểu mẫu',
  PHOTO: '📷 Ảnh',
  FILE: '📎 Tệp',
  CONFIRM: '✅ Xác nhận',
  SCAN: '🔍 Mã quét',
  NOTE: '💬 Ghi chú',
};

interface EvidenceItem extends EvidenceDto {
  executionCode: string;
  stepCode: string;
  stepTitle: string;
}

export function EvidenceView({ onOpenExecution }: { onOpenExecution: (id: string) => void }) {
  const [items, setItems] = React.useState<EvidenceItem[]>([]);
  const [stats, setStats] = React.useState<{ total: number; byKind: Record<string, number> }>({ total: 0, byKind: {} });
  const [kind, setKind] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = kind ? `?kind=${kind}` : '';
      const d = (await api(`/evidence${q}`)) as {
        items: EvidenceItem[];
        stats: { total: number; byKind: Record<string, number> };
      };
      setItems(d.items ?? []);
      setStats(d.stats ?? { total: 0, byKind: {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kind]);

  React.useEffect(() => { load(); }, [load]);

  if (loading) return <div className="empty">Đang tải…</div>;

  return (
    <div>
      <h2 className="page-title">▣ Bằng chứng</h2>
      <p className="page-sub">Thống kê bằng chứng trên toàn hệ thống (T4, PRC-006).</p>
      {error && <div className="alert-error">{error}</div>}

      {/* Thẻ thống kê */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-label">Tổng bằng chứng</div>
        </div>
        {Object.entries(stats.byKind).map(([k, c]) => (
          <div key={k} className="kpi-card" onClick={() => setKind(k)} style={{ cursor: 'pointer' }}>
            <div className="kpi-value">{c}</div>
            <div className="kpi-label">{KIND_LABEL[k] ?? k}</div>
          </div>
        ))}
      </div>

      {/* Bộ lọc */}
      <div className="filter-row">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Tất cả loại</option>
          {Object.keys(KIND_LABEL).map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
        {kind && <button type="button" className="btn-ghost" onClick={() => setKind('')}>Xóa lọc</button>}
      </div>

      {/* Danh sách */}
      <div className="ev-list">
        {items.length === 0 ? (
          <div className="empty">Chưa có bằng chứng.</div>
        ) : items.map((e) => (
          <div key={e.id} className="ev-row">
            <span className="ev-kind">{KIND_LABEL[e.kind] ?? e.kind}</span>
            <button type="button" className="link" onClick={() => onOpenExecution(e.executionId)}>
              {e.executionCode}
            </button>
            <span className="muted">{e.stepCode} — {e.stepTitle}</span>
            <span className="muted">{e.uploadedByName ?? ''} · {new Date(e.uploadedAt).toLocaleString('vi-VN')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
