/**
 * Trang Quản trị (T7 + D-28): người dùng, vai trò (phân quyền), chức vụ,
 * đơn vị, danh mục lý do, nhật ký kiểm tra.
 * SRS v1.6: ADM-001..006. Chỉ hiện khi user có quyền `user.manage`.
 */
import React from 'react';
import type {
  AdminUserDto,
  AdminOrgUnitDto,
  AuditEventDto,
  ReasonCategory,
  ReasonDto,
  RoleWithPermissionsDto,
  AdminPositionDto,
  OrgUnitType,
  UserStatus,
} from '@giangdc-sop/contracts';
import { ORG_UNIT_TYPE_LABEL, REASON_CATEGORY_LABEL, USER_STATUS_LABEL } from '@giangdc-sop/contracts';
import { api } from './App.js';

type Tab = 'users' | 'roles' | 'positions' | 'orgunits' | 'reasons' | 'audit';

const TABS: { key: Tab; label: string }[] = [
  { key: 'users', label: '👥 Người dùng' },
  { key: 'roles', label: '🛡 Vai trò' },
  { key: 'positions', label: '💼 Chức vụ' },
  { key: 'orgunits', label: '🏢 Đơn vị' },
  { key: 'reasons', label: '📝 Lý do' },
  { key: 'audit', label: '📜 Nhật ký' },
];

/** Nhóm quyền cho màn hình phân quyền (khớp packages/domain PERMISSIONS). */
const PERMISSION_GROUPS: { group: string; perms: { code: string; label: string }[] }[] = [
  {
    group: 'Quy trình',
    perms: [
      { code: 'process.create', label: 'Tạo quy trình' },
      { code: 'process.edit', label: 'Sửa quy trình' },
      { code: 'process.review', label: 'Thẩm định' },
      { code: 'process.approve', label: 'Phê duyệt' },
      { code: 'process.publish', label: 'Phát hành' },
      { code: 'process.deprecate', label: 'Hủy phát hành' },
      { code: 'process.view', label: 'Xem quy trình' },
    ],
  },
  {
    group: 'Thực hiện',
    perms: [
      { code: 'execution.create', label: 'Tạo lượt' },
      { code: 'execution.view', label: 'Xem lượt' },
      { code: 'execution.operate', label: 'Thao tác lượt' },
      { code: 'execution.cancel', label: 'Hủy lượt' },
      { code: 'execution.reopen', label: 'Mở lại lượt' },
    ],
  },
  {
    group: 'Bước & Bằng chứng',
    perms: [
      { code: 'step.execute', label: 'Thực hiện bước' },
      { code: 'step.skip', label: 'Bỏ qua bước' },
      { code: 'evidence.upload', label: 'Tải bằng chứng' },
      { code: 'evidence.view', label: 'Xem bằng chứng' },
      { code: 'form.submit', label: 'Gửi biểu mẫu' },
    ],
  },
  {
    group: 'Ngoại lệ',
    perms: [
      { code: 'exception.raise', label: 'Tạo ngoại lệ' },
      { code: 'exception.decide', label: 'Xử lý ngoại lệ' },
      { code: 'exception.approve', label: 'Duyệt ngoại lệ' },
    ],
  },
  {
    group: 'Báo cáo & Hệ thống',
    perms: [
      { code: 'report.view', label: 'Xem báo cáo' },
      { code: 'report.export', label: 'Xuất báo cáo' },
      { code: 'audit.view', label: 'Xem nhật ký' },
      { code: 'user.manage', label: 'Quản trị người dùng' },
      { code: 'role.assign', label: 'Gán vai trò' },
      { code: 'scope.manage', label: 'Quản lý phạm vi' },
    ],
  },
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
  const [orgUnits, setOrgUnits] = React.useState<AdminOrgUnitDto[]>([]);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  // Dialog thêm/sửa
  const [dlg, setDlg] = React.useState<null | { mode: 'add' } | { mode: 'edit'; user: AdminUserDto }>(null);
  const [fUsername, setFUsername] = React.useState('');
  const [fName, setFName] = React.useState('');
  const [fEmail, setFEmail] = React.useState('');
  const [fPhone, setFPhone] = React.useState('');
  const [fPassword, setFPassword] = React.useState('');
  const [fStatus, setFStatus] = React.useState<UserStatus>('ACTIVE');
  const [fRoleIds, setFRoleIds] = React.useState<string[]>([]);
  const [fPositionIds, setFPositionIds] = React.useState<string[]>([]);
  const [fScopeIds, setFScopeIds] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [dlgErr, setDlgErr] = React.useState('');
  // Dialog đặt lại mật khẩu
  const [resetUser, setResetUser] = React.useState<AdminUserDto | null>(null);
  const [resetPw, setResetPw] = React.useState('');
  const [resetErr, setResetErr] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (statusF) params.set('status', statusF);
      const d = (await api(`/admin/users?${params}`)) as { items: AdminUserDto[] };
      setUsers(d.items ?? []);
      const [r, p, o] = await Promise.all([
        api('/admin/roles') as Promise<{ items: RoleWithPermissionsDto[] }>,
        api('/admin/positions') as Promise<{ items: AdminPositionDto[] }>,
        api('/admin/org-units') as Promise<{ items: AdminOrgUnitDto[] }>,
      ]);
      setRoles(r.items ?? []);
      setPositions(p.items ?? []);
      setOrgUnits(o.items ?? []);
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
    setFEmail('');
    setFPhone('');
    setFPassword('');
    setFStatus('ACTIVE');
    setFRoleIds([]);
    setFPositionIds([]);
    setFScopeIds([]);
    setDlgErr('');
    setDlg({ mode: 'add' });
  };
  const openEdit = (u: AdminUserDto) => {
    setFUsername(u.username);
    setFName(u.displayName);
    setFEmail(u.email ?? '');
    setFPhone(u.phone ?? '');
    setFPassword('');
    setFStatus(u.status);
    setFRoleIds(u.roleIds);
    setFPositionIds(u.positionIds);
    setFScopeIds(u.scopeIds);
    setDlgErr('');
    setDlg({ mode: 'edit', user: u });
  };

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

  const rolesOrScopesChanged = (dlgRef: { mode: 'edit'; user: AdminUserDto }) => {
    const u = dlgRef.user;
    return (
      JSON.stringify([...fRoleIds].sort()) !== JSON.stringify([...u.roleIds].sort()) ||
      JSON.stringify([...fPositionIds].sort()) !== JSON.stringify([...u.positionIds].sort()) ||
      JSON.stringify([...fScopeIds].sort()) !== JSON.stringify([...u.scopeIds].sort())
    );
  };

  const doResetPassword = async () => {
    if (!resetUser || !resetPw || resetPw.length < 8) {
      setResetErr('Mật khẩu mới phải từ 8 ký tự trở lên.');
      return;
    }
    setBusy(true);
    setResetErr('');
    try {
      await apiIdem(`/admin/users/${resetUser.id}/reset-password`, 'POST', { password: resetPw });
      setResetUser(null);
      setResetPw('');
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : 'Lỗi đặt lại mật khẩu.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setDlgErr('');
    try {
      if (dlg?.mode === 'add') {
        await apiIdem('/admin/users', 'POST', {
          username: fUsername.trim(),
          displayName: fName.trim(),
          password: fPassword,
          email: fEmail.trim() || undefined,
          phone: fPhone.trim() || undefined,
          roleIds: fRoleIds,
          positionIds: fPositionIds,
          scopeIds: fScopeIds,
        });
      } else if (dlg?.mode === 'edit') {
        const body: Record<string, unknown> = {};
        if (fName.trim() !== dlg.user.displayName) body.displayName = fName.trim();
        if (fStatus !== dlg.user.status) body.status = fStatus;
        if (fEmail.trim() !== (dlg.user.email ?? '')) body.email = fEmail.trim() || null;
        if (fPhone.trim() !== (dlg.user.phone ?? '')) body.phone = fPhone.trim() || null;
        if (fPassword) body.password = fPassword;
        if (Object.keys(body).length === 0 && !rolesOrScopesChanged(dlg)) {
          setDlgErr('Chưa thay đổi gì.');
          setBusy(false);
          return;
        }
        if (Object.keys(body).length > 0) {
          await apiIdem(`/admin/users/${dlg.user.id}`, 'PATCH', body);
        }
        // Gán vai trò / chức vụ / phạm vi nếu đổi.
        const roleChanged =
          JSON.stringify([...fRoleIds].sort()) !== JSON.stringify([...dlg.user.roleIds].sort());
        const posChanged =
          JSON.stringify([...fPositionIds].sort()) !== JSON.stringify([...dlg.user.positionIds].sort());
        const scopeChanged =
          JSON.stringify([...fScopeIds].sort()) !== JSON.stringify([...dlg.user.scopeIds].sort());
        if (roleChanged) await apiIdem(`/admin/users/${dlg.user.id}/roles`, 'POST', { roleIds: fRoleIds });
        if (posChanged)
          await apiIdem(`/admin/users/${dlg.user.id}/positions`, 'POST', { positionIds: fPositionIds });
        if (scopeChanged)
          await apiIdem(`/admin/users/${dlg.user.id}/scopes`, 'POST', { scopeIds: fScopeIds });
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
            <React.Fragment key={u.id}>
              <div className="ver-row">
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
                  <div className="ver-meta" title={u.scopeNames.join(', ') || '—'}>
                    🏢 {u.scopeNames.join(', ') || 'Tất cả'}
                  </div>
                </div>
                <div className="ver-actions">
                  <button
                    type="button"
                    className="btn-small"
                    onClick={() => setDetailId(detailId === u.id ? null : u.id)}
                  >
                    {detailId === u.id ? 'Ẩn' : 'Chi tiết'}
                  </button>
                  <button type="button" className="btn-small" onClick={() => openEdit(u)}>
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="btn-small"
                    onClick={() => {
                      setResetUser(u);
                      setResetPw('');
                      setResetErr('');
                    }}
                  >
                    🔑 Đặt lại MK
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
              {detailId === u.id && (
                <div className="ver-row" style={{ background: '#f7f9fc' }}>
                  <div className="ver-main" style={{ gridColumn: '1 / -1' }}>
                    <div className="ver-meta">📧 Email: {u.email ?? '—'} · 📱 ĐT: {u.phone ?? '—'}</div>
                    <div className="ver-meta">🕐 Đăng nhập cuối: {fmtDT(u.lastLoginAt)} · Tạo lúc: {fmtDT(u.createdAt)}</div>
                    <div className="ver-meta">
                      🛡 Quyền hiệu lực:{' '}
                      {[
                        ...new Set(roles.filter((r) => u.roleIds.includes(r.id)).flatMap((r) => r.permissions)),
                      ]
                        .sort()
                        .join(', ') || '—'}
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
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
            <div className="form-grid">
              <div className="field">
                <label>Email</label>
                <input className="input" type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="name@congty.vn" />
              </div>
              <div className="field">
                <label>Điện thoại</label>
                <input className="input" value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="Số điện thoại" />
              </div>
            </div>
            <div className="field">
              <label>Phạm vi dữ liệu (đơn vị được thấy)</label>
              <div className="check-list">
                {orgUnits.map((o) => (
                  <label key={o.id} className="check">
                    <input
                      type="checkbox"
                      checked={fScopeIds.includes(o.id)}
                      onChange={() => setFScopeIds(toggleId(fScopeIds, o.id))}
                    />
                    {o.name} ({ORG_UNIT_TYPE_LABEL[o.type]})
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

      {resetUser && (
        <div className="modal-backdrop" onClick={() => setResetUser(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Đặt lại mật khẩu: @{resetUser.username}</h3>
            {resetErr && <div className="error-banner">{resetErr}</div>}
            <div className="field">
              <label>Mật khẩu mới * (≥ 8 ký tự)</label>
              <input
                className="input"
                type="password"
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setResetUser(null)}>
                ← Hủy bỏ
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={doResetPassword}>
                {busy ? 'Đang lưu…' : 'Đặt lại mật khẩu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= Tab Vai trò (phân quyền — D-28) ================= */

function RolesTab() {
  const [roles, setRoles] = React.useState<RoleWithPermissionsDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');
  const [dlg, setDlg] = React.useState<null | { mode: 'add' } | { mode: 'edit'; role: RoleWithPermissionsDto }>(null);
  const [fCode, setFCode] = React.useState('');
  const [fName, setFName] = React.useState('');
  const [fDesc, setFDesc] = React.useState('');
  const [fSenior, setFSenior] = React.useState(false);
  const [fPerms, setFPerms] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [dlgErr, setDlgErr] = React.useState('');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = (await api('/admin/roles')) as { items: RoleWithPermissionsDto[] };
      setRoles(d.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi tải vai trò.');
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setFCode('');
    setFName('');
    setFDesc('');
    setFSenior(false);
    setFPerms([]);
    setDlgErr('');
    setDlg({ mode: 'add' });
  };
  const openEdit = (r: RoleWithPermissionsDto) => {
    setFCode(r.code);
    setFName(r.name);
    setFDesc(r.description ?? '');
    setFSenior(r.seniorApprover);
    setFPerms(r.permissions);
    setDlgErr('');
    setDlg({ mode: 'edit', role: r });
  };

  const togglePerm = (code: string) =>
    setFPerms((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));

  const submit = async () => {
    setBusy(true);
    setDlgErr('');
    try {
      if (dlg?.mode === 'add') {
        await apiIdem('/admin/roles', 'POST', {
          code: fCode.trim(),
          name: fName.trim(),
          description: fDesc.trim() || undefined,
          seniorApprover: fSenior,
          permissionIds: fPerms,
        });
      } else if (dlg?.mode === 'edit') {
        const r = dlg.role;
        await apiIdem(`/admin/roles/${r.id}`, 'PATCH', {
          name: fName.trim(),
          description: fDesc.trim() || null,
          seniorApprover: fSenior,
        });
        // Phân quyền nếu thay đổi.
        const permChanged =
          JSON.stringify([...fPerms].sort()) !== JSON.stringify([...r.permissions].sort());
        if (permChanged) {
          await apiIdem(`/admin/roles/${r.id}/permissions`, 'POST', { permissionIds: fPerms });
        }
      }
      setDlg(null);
      load();
    } catch (e) {
      setDlgErr(e instanceof Error ? e.message : 'Lỗi lưu vai trò.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: RoleWithPermissionsDto) => {
    if (r.isSystem) return;
    if (!window.confirm(`Xóa vai trò "${r.name}"? Vai trò đang có ${r.userCount} người dùng sẽ bị chặn.`)) return;
    try {
      await apiIdem(`/admin/roles/${r.id}`, 'DELETE', {});
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi xóa vai trò.');
    }
  };

  if (loading) return <div className="muted">Đang tải…</div>;
  return (
    <div>
      <div className="proc-head" style={{ marginBottom: '1rem' }}>
        <div className="muted">Vai trò ứng dụng — gán quyền cho từng vai trò (phân quyền).</div>
        <button type="button" className="btn-primary" onClick={openAdd} style={{ width: 'auto' }}>
          + Thêm vai trò
        </button>
      </div>
      {err && <div className="error-banner">{err}</div>}
      <div className="ver-timeline">
        <div className="ver-head" aria-hidden="true">
          <span>Vai trò</span>
          <span>Quyền</span>
          <span>Thao tác</span>
        </div>
        {roles.map((r) => (
          <div className="ver-row" key={r.id}>
            <div className="ver-main">
              <div style={{ fontWeight: 700 }}>
                {r.name} {r.seniorApprover && <span title="Người phê duyệt cấp cao">⭐</span>}
                {r.isSystem && <span className="vbadge st-active" title="Vai trò hệ thống — không xóa được">Hệ thống</span>}
              </div>
              <div className="ver-meta">{r.code}{r.description ? ` · ${r.description}` : ''}</div>
              <div className="ver-meta">👥 {r.userCount} người dùng</div>
            </div>
            <div className="ver-main">
              <div className="ver-meta">{r.permissions.length} quyền</div>
              <button
                type="button"
                className="btn-small"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              >
                {expandedId === r.id ? 'Ẩn quyền' : 'Xem quyền'}
              </button>
              {expandedId === r.id && (
                <div className="perm-chips" style={{ marginTop: 6 }}>
                  {r.permissions.map((p) => (
                    <span key={p} className="perm-chip">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="ver-actions">
              <button type="button" className="btn-small" onClick={() => openEdit(r)}>
                Sửa / Phân quyền
              </button>
              {!r.isSystem && (
                <button type="button" className="btn-small danger" onClick={() => remove(r)}>
                  Xóa
                </button>
              )}
            </div>
          </div>
        ))}
        {roles.length === 0 && <div className="muted" style={{ padding: '1rem' }}>Chưa có vai trò nào.</div>}
      </div>

      {dlg && (
        <div className="modal-backdrop" onClick={() => setDlg(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h3>{dlg.mode === 'add' ? 'Thêm vai trò' : `Sửa vai trò: ${dlg.role.code}`}</h3>
            {dlgErr && <div className="error-banner">{dlgErr}</div>}
            <div className="form-grid">
              <div className="field">
                <label>Mã vai trò *</label>
                <input
                  className="input"
                  value={fCode}
                  disabled={dlg.mode === 'edit'}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="vd: TRUONG_PHONG"
                />
              </div>
              <div className="field">
                <label>Tên vai trò *</label>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="vd: Trưởng phòng" />
              </div>
            </div>
            <div className="field">
              <label>Mô tả</label>
              <input value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Mô tả ngắn về vai trò" />
            </div>
            <label className="check" style={{ marginBottom: '1rem' }}>
              <input type="checkbox" checked={fSenior} onChange={(e) => setFSenior(e.target.checked)} />
              ⭐ Người phê duyệt cấp cao (duyệt được bước mức HIGH/BLOCKING)
            </label>
            <div className="field">
              <label>Phân quyền ({fPerms.length} quyền đã chọn)</label>
              {PERMISSION_GROUPS.map((g) => (
                <div key={g.group} style={{ marginBottom: '0.6rem' }}>
                  <div className="ver-meta" style={{ fontWeight: 700, marginBottom: 4 }}>{g.group}</div>
                  <div className="check-list">
                    {g.perms.map((p) => (
                      <label key={p.code} className="check" title={p.code}>
                        <input
                          type="checkbox"
                          checked={fPerms.includes(p.code)}
                          onChange={() => togglePerm(p.code)}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setDlg(null)}>
                ← Hủy bỏ
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
                {busy ? 'Đang lưu…' : dlg.mode === 'add' ? 'Tạo vai trò' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= Tab Chức vụ (D-28) ================= */

function PositionsTab() {
  const [items, setItems] = React.useState<AdminPositionDto[]>([]);
  const [orgUnits, setOrgUnits] = React.useState<AdminOrgUnitDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');
  const [dlg, setDlg] = React.useState<null | { mode: 'add' } | { mode: 'edit'; item: AdminPositionDto }>(null);
  const [fCode, setFCode] = React.useState('');
  const [fName, setFName] = React.useState('');
  const [fDesc, setFDesc] = React.useState('');
  const [fOrgUnitId, setFOrgUnitId] = React.useState('');
  const [fActive, setFActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [dlgErr, setDlgErr] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [p, o] = await Promise.all([
        api('/admin/positions') as Promise<{ items: AdminPositionDto[] }>,
        api('/admin/org-units') as Promise<{ items: AdminOrgUnitDto[] }>,
      ]);
      setItems(p.items ?? []);
      setOrgUnits(o.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi tải chức vụ.');
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setFCode('');
    setFName('');
    setFDesc('');
    setFOrgUnitId('');
    setFActive(true);
    setDlgErr('');
    setDlg({ mode: 'add' });
  };
  const openEdit = (p: AdminPositionDto) => {
    setFCode(p.code);
    setFName(p.name);
    setFDesc(p.description ?? '');
    setFOrgUnitId(p.orgUnitId ?? '');
    setFActive(p.isActive);
    setDlgErr('');
    setDlg({ mode: 'edit', item: p });
  };

  const submit = async () => {
    setBusy(true);
    setDlgErr('');
    try {
      if (dlg?.mode === 'add') {
        await apiIdem('/admin/positions', 'POST', {
          code: fCode.trim(),
          name: fName.trim(),
          description: fDesc.trim() || undefined,
          orgUnitId: fOrgUnitId || null,
        });
      } else if (dlg?.mode === 'edit') {
        await apiIdem(`/admin/positions/${dlg.item.id}`, 'PATCH', {
          name: fName.trim(),
          description: fDesc.trim() || null,
          orgUnitId: fOrgUnitId || null,
          isActive: fActive,
        });
      }
      setDlg(null);
      load();
    } catch (e) {
      setDlgErr(e instanceof Error ? e.message : 'Lỗi lưu chức vụ.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: AdminPositionDto) => {
    if (!window.confirm(`Xóa chức vụ "${p.name}"? Chức vụ đang được dùng sẽ bị chặn.`)) return;
    try {
      await apiIdem(`/admin/positions/${p.id}`, 'DELETE', {});
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi xóa chức vụ.');
    }
  };

  if (loading) return <div className="muted">Đang tải…</div>;
  return (
    <div>
      <div className="proc-head" style={{ marginBottom: '1rem' }}>
        <div className="muted">Chức vụ trong công ty — gán cho nhân viên và dùng ở các bước quy trình.</div>
        <button type="button" className="btn-primary" onClick={openAdd} style={{ width: 'auto' }}>
          + Thêm chức vụ
        </button>
      </div>
      {err && <div className="error-banner">{err}</div>}
      <div className="ver-timeline">
        <div className="ver-head" aria-hidden="true">
          <span>Chức vụ</span>
          <span>Đơn vị / Số người</span>
          <span>Thao tác</span>
        </div>
        {items.map((p) => (
          <div className="ver-row" key={p.id}>
            <div className="ver-main">
              <div style={{ fontWeight: 700 }}>
                {p.name} {!p.isActive && <span className="vbadge st-void">Ngừng dùng</span>}
              </div>
              <div className="ver-meta">{p.code}{p.description ? ` · ${p.description}` : ''}</div>
            </div>
            <div className="ver-main">
              <div className="ver-meta">🏢 {p.orgUnitName ?? 'Toàn công ty'}</div>
              <div className="ver-meta">👥 {p.userCount} người giữ chức vụ</div>
            </div>
            <div className="ver-actions">
              <button type="button" className="btn-small" onClick={() => openEdit(p)}>
                Sửa
              </button>
              <button type="button" className="btn-small danger" onClick={() => remove(p)}>
                Xóa
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="muted" style={{ padding: '1rem' }}>Chưa có chức vụ nào.</div>}
      </div>

      {dlg && (
        <div className="modal-backdrop" onClick={() => setDlg(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{dlg.mode === 'add' ? 'Thêm chức vụ' : `Sửa chức vụ: ${dlg.item.code}`}</h3>
            {dlgErr && <div className="error-banner">{dlgErr}</div>}
            <div className="form-grid">
              <div className="field">
                <label>Mã chức vụ *</label>
                <input
                  className="input"
                  value={fCode}
                  disabled={dlg.mode === 'edit'}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="vd: pos-ke-toan"
                />
              </div>
              <div className="field">
                <label>Tên chức vụ *</label>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="vd: Kế toán" />
              </div>
            </div>
            <div className="field">
              <label>Mô tả</label>
              <input value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Mô tả ngắn" />
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Đơn vị</label>
                <select className="input" value={fOrgUnitId} onChange={(e) => setFOrgUnitId(e.target.value)}>
                  <option value="">Toàn công ty</option>
                  {orgUnits.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              {dlg.mode === 'edit' && (
                <div className="field">
                  <label>Trạng thái</label>
                  <select className="input" value={fActive ? '1' : '0'} onChange={(e) => setFActive(e.target.value === '1')}>
                    <option value="1">Đang dùng</option>
                    <option value="0">Ngừng dùng</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setDlg(null)}>
                ← Hủy bỏ
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
                {busy ? 'Đang lưu…' : dlg.mode === 'add' ? 'Tạo chức vụ' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= Tab Đơn vị (D-28) ================= */

function OrgUnitsTab() {
  const [tree, setTree] = React.useState<AdminOrgUnitDto[]>([]);
  const [flat, setFlat] = React.useState<AdminOrgUnitDto[]>([]);
  const [users, setUsers] = React.useState<AdminUserDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState('');
  const [dlg, setDlg] = React.useState<null | { mode: 'add' } | { mode: 'edit'; item: AdminOrgUnitDto }>(null);
  const [fCode, setFCode] = React.useState('');
  const [fName, setFName] = React.useState('');
  const [fType, setFType] = React.useState<OrgUnitType>('OFFICE');
  const [fParentId, setFParentId] = React.useState('');
  const [fAddress, setFAddress] = React.useState('');
  const [fPhone, setFPhone] = React.useState('');
  const [fManagerId, setFManagerId] = React.useState('');
  const [fActive, setFActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [dlgErr, setDlgErr] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [t, f, u] = await Promise.all([
        api('/admin/org-units?tree=1') as Promise<{ items: AdminOrgUnitDto[] }>,
        api('/admin/org-units') as Promise<{ items: AdminOrgUnitDto[] }>,
        api('/admin/users') as Promise<{ items: AdminUserDto[] }>,
      ]);
      setTree(t.items ?? []);
      setFlat(f.items ?? []);
      setUsers(u.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi tải đơn vị.');
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setFCode('');
    setFName('');
    setFType('OFFICE');
    setFParentId('');
    setFAddress('');
    setFPhone('');
    setFManagerId('');
    setFActive(true);
    setDlgErr('');
    setDlg({ mode: 'add' });
  };
  const openEdit = (o: AdminOrgUnitDto) => {
    setFCode(o.code ?? '');
    setFName(o.name);
    setFType(o.type);
    setFParentId(o.parentId ?? '');
    setFAddress(o.address ?? '');
    setFPhone(o.phone ?? '');
    setFManagerId(o.managerUserId ?? '');
    setFActive(o.isActive);
    setDlgErr('');
    setDlg({ mode: 'edit', item: o });
  };

  const submit = async () => {
    setBusy(true);
    setDlgErr('');
    try {
      const body = {
        code: fCode.trim() || undefined,
        name: fName.trim(),
        type: fType,
        parentId: fParentId || null,
        address: fAddress.trim() || undefined,
        phone: fPhone.trim() || undefined,
        managerUserId: fManagerId || null,
      };
      if (dlg?.mode === 'add') {
        await apiIdem('/admin/org-units', 'POST', body);
      } else if (dlg?.mode === 'edit') {
        await apiIdem(`/admin/org-units/${dlg.item.id}`, 'PATCH', { ...body, isActive: fActive });
      }
      setDlg(null);
      load();
    } catch (e) {
      setDlgErr(e instanceof Error ? e.message : 'Lỗi lưu đơn vị.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (o: AdminOrgUnitDto) => {
    if (!window.confirm(`Xóa đơn vị "${o.name}"? Đơn vị còn đơn vị con hoặc đang dùng sẽ bị chặn.`)) return;
    try {
      await apiIdem(`/admin/org-units/${o.id}`, 'DELETE', {});
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi xóa đơn vị.');
    }
  };

  const renderNode = (node: AdminOrgUnitDto, depth: number) => (
    <React.Fragment key={node.id}>
      <div className="ver-row">
        <div className="ver-main" style={{ paddingLeft: depth * 20 }}>
          <div style={{ fontWeight: 700 }}>
            {'—'.repeat(depth)}{depth > 0 ? ' ' : ''}{node.name}
            {!node.isActive && <span className="vbadge st-void">Ngừng dùng</span>}
          </div>
          <div className="ver-meta">
            {node.code && `${node.code} · `}{ORG_UNIT_TYPE_LABEL[node.type]}
            {node.childCount > 0 && ` · ${node.childCount} đơn vị con`}
          </div>
          {node.address && <div className="ver-meta">📍 {node.address}</div>}
        </div>
        <div className="ver-main">
          <div className="ver-meta">👤 {node.managerUserName ?? '—'}</div>
          <div className="ver-meta">👥 {node.userCount} người</div>
        </div>
        <div className="ver-actions">
          <button type="button" className="btn-small" onClick={() => openEdit(node)}>
            Sửa
          </button>
          <button type="button" className="btn-small danger" onClick={() => remove(node)}>
            Xóa
          </button>
        </div>
      </div>
      {(node.children ?? []).map((c) => renderNode(c, depth + 1))}
    </React.Fragment>
  );

  if (loading) return <div className="muted">Đang tải…</div>;
  return (
    <div>
      <div className="proc-head" style={{ marginBottom: '1rem' }}>
        <div className="muted">Cây đơn vị: Tổng công ty → Văn phòng/Chi nhánh → Kho.</div>
        <button type="button" className="btn-primary" onClick={openAdd} style={{ width: 'auto' }}>
          + Thêm đơn vị
        </button>
      </div>
      {err && <div className="error-banner">{err}</div>}
      <div className="ver-timeline">
        <div className="ver-head" aria-hidden="true">
          <span>Đơn vị</span>
          <span>Người phụ trách / Số người</span>
          <span>Thao tác</span>
        </div>
        {tree.map((n) => renderNode(n, 0))}
        {tree.length === 0 && <div className="muted" style={{ padding: '1rem' }}>Chưa có đơn vị nào.</div>}
      </div>

      {dlg && (
        <div className="modal-backdrop" onClick={() => setDlg(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{dlg.mode === 'add' ? 'Thêm đơn vị' : `Sửa đơn vị: ${dlg.item.name}`}</h3>
            {dlgErr && <div className="error-banner">{dlgErr}</div>}
            <div className="form-grid">
              <div className="field">
                <label>Mã đơn vị</label>
                <input className="input" value={fCode} onChange={(e) => setFCode(e.target.value)} placeholder="vd: CN-HN" />
              </div>
              <div className="field">
                <label>Tên đơn vị *</label>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="vd: Chi nhánh Hà Nội" />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Loại đơn vị *</label>
                <select className="input" value={fType} onChange={(e) => setFType(e.target.value as OrgUnitType)}>
                  <option value="ORG">Tổng công ty</option>
                  <option value="OFFICE">Văn phòng / Chi nhánh</option>
                  <option value="WAREHOUSE">Kho</option>
                </select>
              </div>
              <div className="field">
                <label>Đơn vị cha</label>
                <select className="input" value={fParentId} onChange={(e) => setFParentId(e.target.value)}>
                  <option value="">— Đơn vị gốc —</option>
                  {flat
                    .filter((o) => !dlg || dlg.mode === 'add' || o.id !== dlg.item.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Địa chỉ</label>
                <input value={fAddress} onChange={(e) => setFAddress(e.target.value)} placeholder="Số nhà, đường, phường…" />
              </div>
              <div className="field">
                <label>Điện thoại</label>
                <input value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="Số điện thoại" />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Người phụ trách</label>
                <select className="input" value={fManagerId} onChange={(e) => setFManagerId(e.target.value)}>
                  <option value="">— Chưa chọn —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} (@{u.username})
                    </option>
                  ))}
                </select>
              </div>
              {dlg.mode === 'edit' && (
                <div className="field">
                  <label>Trạng thái</label>
                  <select className="input" value={fActive ? '1' : '0'} onChange={(e) => setFActive(e.target.value === '1')}>
                    <option value="1">Đang dùng</option>
                    <option value="0">Ngừng dùng</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setDlg(null)}>
                ← Hủy bỏ
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
                {busy ? 'Đang lưu…' : dlg.mode === 'add' ? 'Tạo đơn vị' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
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
          <p className="page-sub">Quản lý tài khoản, phân quyền vai trò, chức vụ, đơn vị, danh mục lý do và tra cứu nhật ký kiểm tra.</p>
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
        {tab === 'positions' && <PositionsTab />}
        {tab === 'orgunits' && <OrgUnitsTab />}
        {tab === 'reasons' && <ReasonsTab />}
        {tab === 'audit' && <AuditTab />}
      </section>
    </div>
  );
}
