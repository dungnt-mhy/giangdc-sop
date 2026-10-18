/**
 * Trang Quản trị (T7): tài khoản, vai trò, danh mục lý do, nhật ký kiểm tra.
 * SRS v1.6: ADM-001..006. Chỉ hiện khi user có quyền `user.manage`.
 */
import React from 'react';
import type {
  AdminUserDto,
  AuditEventDto,
  ReasonCategory,
  ReasonDto,
  RoleWithPermissionsDto,
  AdminPositionDto,
  UserStatus,
} from '@giangdc-sop/contracts';
import { REASON_CATEGORY_LABEL, USER_STATUS_LABEL } from '@giangdc-sop/contracts';
import { api } from './App.js';

type Tab = 'users' | 'roles' | 'reasons' | 'audit';

const TABS: { key: Tab; label: string }[] = [
  { key: 'users', label: '👥 Người dùng' },
  { key: 'roles', label: '🛡 Vai trò' },
  { key: 'reasons', label: '📝 Lý do' },
  { key: 'audit', label: '📜 Nhật ký' },
];

const fmtDT = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');
const idemKey = () => crypto.randomUUID();

async function apiIdem(path: string, method: string, body: unknown) {
  return api(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey() },
    body: JSON.stringify(body),
  });
}

function StatusBadge({ status }: { status: UserStatus }) {
  const cls =
    status === 'ACTIVE' ? 'st-active' : status === 'LOCKED' ? 'st-retired' : 'st-void';
  return <span className={`vbadge ${cls}`}>{USER_STATUS_LABEL[status]}</span>;
}

/* ================= Tab Người dùng ================= */

function UsersTab({ selfId }: { selfId: string }) {
  const [users, setUsers] = React.useState<AdminUserDto[]>([]);
  const [q, setQ] = React.useState('');
  const [statusF, setStatusF] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');
  const [roles, setRoles] = React.useState<RoleWithPermissionsDto[]>([]);
  const [positions, setPositions] = React.useState<AdminPositionDto[]>([]);
  // Dialog thêm/sửa
  const [dlg, setDlg] = React.useState<null | { mode: 'add' } | { mode: 'edit'; user: AdminUserDto }>(null);
  const [fUsername, setFUsername] = React.useState('');
  const [fName, setFName] = React.useState('');
  const [fPassword, setFPassword] = React.useState('');
  const [fStatus, setFStatus] = React.useState<UserStatus>('ACTIVE');
  const [fRoleIds, setFRoleIds] = React.useState<string[]>([]);
  const [fPositionIds, setFPositionIds] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [dlgErr, setDlgErr] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (statusF) params.set('status', statusF);
      const d = (await api(`/admin/users?${params}`)) as { items: AdminUserDto[] };
      setUsers(d.items ?? []);
      const [r, p] = await Promise.all([
        api('/admin/roles') as Promise<{ items: RoleWithPermissionsDto[] }>,
        api('/admin/positions') as Promise<{ items: AdminPositionDto[] }>,
      ]);
      setRoles(r.items ?? []);
      setPositions(p.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi tải danh sách.');
    } finally {
      setLoading(false);
    }
  }, [q, statusF]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setFUsername('');
    setFName('');
    setFPassword('');
    setFStatus('ACTIVE');
    setFRoleIds([]);
    setFPositionIds([]);
    setDlgErr('');
    setDlg({ mode: 'add' });
  };
  const openEdit = (u: AdminUserDto) => {
    setFUsername(u.username);
    setFName(u.displayName);
    setFPassword('');
    setFStatus(u.status);
    setFRoleIds(u.roleIds);
    setFPositionIds(u.positionIds);
    setDlgErr('');
    setDlg({ mode: 'edit', user: u });
  };

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

  const submit = async () => {
    setBusy(true);
    setDlgErr('');
    try {
      if (dlg?.mode === 'add') {
        await apiIdem('/admin/users', 'POST', {
          username: fUsername.trim(),
          displayName: fName.trim(),
          password: fPassword,
          roleIds: fRoleIds,
          positionIds: fPositionIds,
        });
      } else if (dlg?.mode === 'edit') {
        const body: Record<string, unknown> = {};
        if (fName.trim() !== dlg.user.displayName) body.displayName = fName.trim();
        if (fStatus !== dlg.user.status) body.status = fStatus;
        if (fPassword) body.password = fPassword;
        if (Object.keys(body).length === 0) {
          setDlgErr('Chưa thay đổi gì.');
          setBusy(false);
          return;
        }
        await apiIdem(`/admin/users/${dlg.user.id}`, 'PATCH', body);
        // Gán vai trò / chức vụ nếu đổi.
        const roleChanged =
          JSON.stringify([...fRoleIds].sort()) !== JSON.stringify([...dlg.user.roleIds].sort());
        const posChanged =
          JSON.stringify([...fPositionIds].sort()) !== JSON.stringify([...dlg.user.positionIds].sort());
        if (roleChanged) await apiIdem(`/admin/users/${dlg.user.id}/roles`, 'POST', { roleIds: fRoleIds });
        if (posChanged)
          await apiIdem(`/admin/users/${dlg.user.id}/positions`, 'POST', { positionIds: fPositionIds });
      }
      setDlg(null);
      load();
    } catch (e) {
      setDlgErr(e instanceof Error ? e.message : 'Lỗi lưu.');
    } finally {
      setBusy(false);
    }
  };

  const toggleLock = async (u: AdminUserDto) => {
    if (u.id === selfId) return;
    if (!window.confirm) return;
    const to = u.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    try {
      await apiIdem(`/admin/users/${u.id}`, 'PATCH', { status: to });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi cập nhật trạng thái.');
    }
  };

  return (
    <div>
      <div className="proc-head" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            className="input search-input"
            placeholder="🔍 Tìm tên / username…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 260 }}
          />
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="search-input" style={{ maxWidth: 180 }}>
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="LOCKED">Đã khóa</option>
            <option value="DISABLED">Đã vô hiệu</option>
          </select>
        </div>
        <button type="button" className="btn-primary" onClick={openAdd} style={{ width: 'auto' }}>
          + Thêm tài khoản
        </button>
      </div>

      {err && <div className="error-banner">{err}</div>}
      {loading ? (
        <div className="muted">Đang tải…</div>
      ) : (
        <div className="ver-timeline">
          <div className="ver-head" aria-hidden="true">
            <span>Tài khoản</span>
            <span>Vai trò / Chức vụ</span>
            <span>Thao tác</span>
          </div>
          {users.map((u) => (
            <div className="ver-row" key={u.id}>
              <div className="ver-main">
                <div style={{ fontWeight: 700 }}>{u.displayName}</div>
                <div className="ver-meta">@{u.username}</div>
                <div style={{ marginTop: 4 }}>
                  <StatusBadge status={u.status} />
                </div>
              </div>
              <div className="ver-main">
                <div className="ver-meta" title={u.roleNames.join(', ') || '—'}>
                  🛡 {u.roleNames.join(', ') || '—'}
                </div>
                <div className="ver-meta" title={u.positionNames.join(', ') || '—'}>
                  💼 {u.positionNames.join(', ') || '—'}
                </div>
              </div>
              <div className="ver-actions">
                <button type="button" className="btn-small" onClick={() => openEdit(u)}>
                  Sửa
                </button>
                {u.id !== selfId && (
                  <button
                    type="button"
                    className={`btn-small${u.status === 'ACTIVE' ? ' danger' : ''}`}
                    onClick={() => toggleLock(u)}
                  >
                    {u.status === 'ACTIVE' ? '🔒 Khóa' : '🔓 Mở'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && <div className="muted" style={{ padding: '1rem' }}>Không có tài khoản nào.</div>}
        </div>
      )}

      {dlg && (
        <div className="modal-backdrop" onClick={() => setDlg(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>{dlg.mode === 'add' ? 'Thêm tài khoản' : `Sửa: ${dlg.user.username}`}</h3>
            {dlgErr && <div className="error-banner">{dlgErr}</div>}
            <div className="form-grid">
              <div className="field">
                <label>Tên đăng nhập *</label>
                <input className="input"
                  value={fUsername}
                  disabled={dlg.mode === 'edit'}
                  onChange={(e) => setFUsername(e.target.value)}
                  placeholder="vd: nhanvien2"
                />
              </div>
              <div className="field">
                <label>Tên hiển thị *</label>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="vd: Nguyễn Văn A" />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>{dlg.mode === 'add' ? 'Mật khẩu * (≥ 8 ký tự)' : 'Mật khẩu mới (để trống = giữ nguyên)'}</label>
                <input className="input"
                  type="password"
                  value={fPassword}
                  onChange={(e) => setFPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="field">
                <label>Trạng thái</label>
                <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value as UserStatus)}>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="LOCKED">Đã khóa</option>
                  <option value="DISABLED">Đã vô hiệu</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Vai trò ứng dụng</label>
              <div className="check-list">
                {roles.map((r) => (
                  <label key={r.id} className="check">
                    <input
                      type="checkbox"
                      checked={fRoleIds.includes(r.id)}
                      onChange={() => setFRoleIds(toggleId(fRoleIds, r.id))}
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Chức vụ</label>
              <div className="check-list">
                {positions.map((p) => (
                  <label key={p.id} className="check">
                    <input
                      type="checkbox"
                      checked={fPositionIds.includes(p.id)}
                      onChange={() => setFPositionIds(toggleId(fPositionIds, p.id))}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setDlg(null)}>
                ← Hủy bỏ
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
                {busy ? 'Đang lưu…' : dlg.mode === 'add' ? 'Tạo tài khoản' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= Tab Vai trò (read-only) ================= */

function RolesTab() {
  const [roles, setRoles] = React.useState<RoleWithPermissionsDto[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const d = (await api('/admin/roles')) as { items: RoleWithPermissionsDto[] };
        setRoles(d.items ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="muted">Đang tải…</div>;
  return (
    <div className="ver-timeline">
      <div className="ver-head" aria-hidden="true">
        <span>Vai trò</span>
        <span>Quyền</span>
        <span></span>
      </div>
      {roles.map((r) => (
        <div className="ver-row" key={r.id}>
          <div className="ver-main">
            <div style={{ fontWeight: 700 }}>
              {r.name} {r.seniorApprover && <span title="Người phê duyệt cấp cao">⭐</span>}
            </div>
            <div className="ver-meta">{r.code}</div>
          </div>
          <div className="ver-main">
            <div className="perm-chips">
              {r.permissions.map((p) => (
                <span key={p} className="perm-chip">
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="ver-actions" />
        </div>
      ))}
    </div>
  );
}

/* ================= Tab Lý do ================= */

function ReasonsTab() {
  const [items, setItems] = React.useState<ReasonDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [catF, setCatF] = React.useState('');
  const [dlg, setDlg] = React.useState<null | { mode: 'add' } | { mode: 'edit'; item: ReasonDto }>(null);
  const [fCode, setFCode] = React.useState('');
  const [fLabel, setFLabel] = React.useState('');
  const [fCat, setFCat] = React.useState<ReasonCategory>('cancel');
  const [fActive, setFActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = (await api('/admin/reasons')) as { items: ReasonDto[] };
      setItems(d.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = catF ? items.filter((r) => r.category === catF) : items;

  const openAdd = () => {
    setFCode('');
    setFLabel('');
    setFCat('cancel');
    setFActive(true);
    setErr('');
    setDlg({ mode: 'add' });
  };
  const openEdit = (item: ReasonDto) => {
    setFCode(item.code);
    setFLabel(item.label);
    setFCat(item.category);
    setFActive(item.isActive);
    setErr('');
    setDlg({ mode: 'edit', item });
  };

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      if (dlg?.mode === 'add') {
        await apiIdem('/admin/reasons', 'POST', { code: fCode, category: fCat, label: fLabel });
      } else if (dlg?.mode === 'edit') {
        await apiIdem(`/admin/reasons/${dlg.item.id}`, 'PATCH', {
          label: fLabel,
          category: fCat,
          isActive: fActive,
        });
      }
      setDlg(null);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi lưu.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: ReasonDto) => {
    try {
      await apiIdem(`/admin/reasons/${r.id}`, 'PATCH', { isActive: !r.isActive });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi cập nhật.');
    }
  };

  return (
    <div>
      <div className="proc-head" style={{ marginBottom: '1rem' }}>
        <select value={catF} onChange={(e) => setCatF(e.target.value)} className="search-input" style={{ maxWidth: 220 }}>
          <option value="">Tất cả nhóm</option>
          <option value="cancel">Hủy lượt</option>
          <option value="skip">Bỏ qua bước</option>
          <option value="fail">Không đạt</option>
          <option value="reject">Từ chối</option>
        </select>
        <button type="button" className="btn-primary" onClick={openAdd} style={{ width: 'auto' }}>
          + Thêm lý do
        </button>
      </div>
      {err && <div className="error-banner">{err}</div>}
      {loading ? (
        <div className="muted">Đang tải…</div>
      ) : (
        <div className="ver-timeline">
          <div className="ver-head" aria-hidden="true">
            <span>Mã</span>
            <span>Nhãn / Nhóm</span>
            <span>Thao tác</span>
          </div>
          {filtered.map((r) => (
            <div className="ver-row" key={r.id}>
              <div className="ver-main">
                <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.code}</div>
                {!r.isActive && <span className="vbadge st-void">Tắt</span>}
              </div>
              <div className="ver-main">
                <div>{r.label}</div>
                <div className="ver-meta">{REASON_CATEGORY_LABEL[r.category]}</div>
              </div>
              <div className="ver-actions">
                <button type="button" className="btn-small" onClick={() => openEdit(r)}>
                  Sửa
                </button>
                <button type="button" className="btn-small" onClick={() => toggleActive(r)}>
                  {r.isActive ? 'Tắt' : 'Bật'}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="muted" style={{ padding: '1rem' }}>Không có lý do nào.</div>}
        </div>
      )}

      {dlg && (
        <div className="modal-backdrop" onClick={() => setDlg(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{dlg.mode === 'add' ? 'Thêm lý do' : 'Sửa lý do'}</h3>
            {err && <div className="error-banner">{err}</div>}
            <div className="field">
              <label>Mã *</label>
              <input value={fCode} disabled={dlg.mode === 'edit'} onChange={(e) => setFCode(e.target.value)} placeholder="vd: CANCEL_PLAN_CHANGED" />
            </div>
            <div className="field">
              <label>Nhãn *</label>
              <input value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder="vd: Thay đổi kế hoạch" />
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Nhóm</label>
                <select className="input" value={fCat} onChange={(e) => setFCat(e.target.value as ReasonCategory)}>
                  <option value="cancel">Hủy lượt</option>
                  <option value="skip">Bỏ qua bước</option>
                  <option value="fail">Không đạt</option>
                  <option value="reject">Từ chối</option>
                </select>
              </div>
              {dlg.mode === 'edit' && (
                <div className="field">
                  <label>Trạng thái</label>
                  <select className="input" value={fActive ? '1' : '0'} onChange={(e) => setFActive(e.target.value === '1')}>
                    <option value="1">Đang dùng</option>
                    <option value="0">Tắt</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setDlg(null)}>
                ← Hủy bỏ
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
                {busy ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= Tab Nhật ký (ADM-002/004) ================= */

function AuditTab() {
  const [items, setItems] = React.useState<AuditEventDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fFrom, setFFrom] = React.useState('');
  const [fTo, setFTo] = React.useState('');
  const [fAction, setFAction] = React.useState('');
  const [fQ, setFQ] = React.useState('');
  const [page, setPage] = React.useState(0);
  const LIMIT = 20;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fFrom) params.set('from', new Date(fFrom).toISOString());
      if (fTo) params.set('to', new Date(fTo).toISOString());
      if (fAction.trim()) params.set('action', fAction.trim());
      if (fQ.trim()) params.set('q', fQ.trim());
      params.set('limit', String(LIMIT));
      params.set('offset', String(page * LIMIT));
      const d = (await api(`/admin/audit?${params}`)) as { items: AuditEventDto[]; total: number };
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [fFrom, fTo, fAction, fQ, page]);

  React.useEffect(() => {
    load();
  }, [load]);

  const search = () => {
    setPage(0);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input type="datetime-local" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="search-input" style={{ maxWidth: 200 }} title="Từ" />
        <input type="datetime-local" value={fTo} onChange={(e) => setFTo(e.target.value)} className="search-input" style={{ maxWidth: 200 }} title="Đến" />
        <input value={fAction} onChange={(e) => setFAction(e.target.value)} className="search-input" placeholder="Action (vd: user.create)" style={{ maxWidth: 200 }} />
        <input value={fQ} onChange={(e) => setFQ(e.target.value)} className="search-input" placeholder="🔍 Tìm kiếm…" style={{ maxWidth: 200 }} />
        <button type="button" className="btn-small" onClick={search}>
          Lọc
        </button>
      </div>
      {loading ? (
        <div className="muted">Đang tải…</div>
      ) : (
        <>
          <div className="ver-timeline">
            <div className="ver-head" aria-hidden="true">
              <span>Thời gian</span>
              <span>Sự kiện</span>
              <span></span>
            </div>
            {items.map((a) => (
              <div className="ver-row" key={a.id}>
                <div className="ver-main">
                  <div style={{ fontSize: '0.85rem' }}>{fmtDT(a.createdAt)}</div>
                  {a.flagged && <span className="vbadge st-retired">⚑ Gắn cờ</span>}
                </div>
                <div className="ver-main">
                  <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>{a.action}</div>
                  <div className="ver-meta">
                    👤 {a.actorName ?? 'hệ thống'}
                    {a.objectType && ` · ${a.objectType}${a.objectId ? `/${a.objectId.slice(0, 8)}` : ''}`}
                  </div>
                  {a.reason && <div className="ver-meta">{a.reason}</div>}
                </div>
                <div className="ver-actions" />
              </div>
            ))}
            {items.length === 0 && <div className="muted" style={{ padding: '1rem' }}>Không có bản ghi nào.</div>}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: '0.8rem' }}>
            <button type="button" className="btn-small" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ← Trước
            </button>
            <span className="muted">
              Trang {page + 1} · {total} bản ghi
            </span>
            <button
              type="button"
              className="btn-small"
              disabled={(page + 1) * LIMIT >= total}
              onClick={() => setPage(page + 1)}
            >
              Sau →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ================= Trang chính ================= */

export function AdminView({ userId }: { userId: string }) {
  const [tab, setTab] = React.useState<Tab>('users');
  return (
    <div>
      <header className="topbar">
        <div>
          <div className="crumb">
            Trang chủ <span> / </span> <strong>Quản trị</strong>
          </div>
          <h2 className="page-title">⚙ Quản trị hệ thống</h2>
          <p className="page-sub">Quản lý tài khoản, vai trò, danh mục lý do và tra cứu nhật ký kiểm tra.</p>
        </div>
      </header>

      <div className="seg-toggle" style={{ marginBottom: '1.2rem' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="section">
        {tab === 'users' && <UsersTab selfId={userId} />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'reasons' && <ReasonsTab />}
        {tab === 'audit' && <AuditTab />}
      </section>
    </div>
  );
}
