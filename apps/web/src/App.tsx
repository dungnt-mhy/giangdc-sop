import React from 'react';
import { ProcessesView } from './processes.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const LOGO_URL = `${import.meta.env.BASE_URL}logo.webp`;

interface AppRole {
  id: string;
  code: string;
  name: string;
  seniorApprover: boolean;
}

interface AppPosition {
  id: string;
  code: string;
  name: string;
}

interface MeResponse {
  user: { id: string; username: string; displayName: string };
  roles: AppRole[];
  positions: AppPosition[];
  permissions: string[];
  scopes: string[];
}

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { message?: string }).message ?? 'Lỗi hệ thống.');
    (err as { code?: string }).code = (data as { code?: string }).code;
    throw err;
  }
  return data;
}

const SCOPE_LABEL: Record<string, string> = {
  'org-root': 'Công ty (trụ sở)',
  'vp-hn': 'Văn phòng Hà Nội',
  'kho-hn': 'Kho Hà Nội',
};

const PERM_GROUP_LABEL: Record<string, string> = {
  process: 'Quy trình',
  execution: 'Lượt thực hiện',
  step: 'Bước thực hiện',
  exception: 'Ngoại lệ',
  evidence: 'Bằng chứng',
  form: 'Biểu mẫu',
  report: 'Báo cáo',
  audit: 'Nhật ký kiểm tra',
  user: 'Quản trị người dùng',
  role: 'Quản trị vai trò',
  scope: 'Quản trị phạm vi',
};

function groupPermissions(perms: string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const p of [...perms].sort()) {
    const prefix = p.split('.')[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(p);
  }
  return [...groups.entries()];
}

const DEMO_ACCOUNTS: [string, string, string][] = [
  ['admin', 'Admin@123', 'Quản trị'],
  ['quanly', 'Manager@123', 'Quản lý'],
  ['pheduyet', 'Approve@123', 'Người phê duyệt'],
  ['nhanvien', 'Staff@123', 'Nhân viên'],
];

function Logo({ size }: { size: number }) {
  return (
    <img
      className="logo-img"
      src={LOGO_URL}
      alt="SOP Platform"
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
}

/* ---------------- Trang đăng nhập ---------------- */
function LoginPage({ onLogin }: { onLogin: (me: MeResponse) => void }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPw, setShowPw] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(true);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const me = (await api('/auth/me')) as MeResponse;
      onLogin(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="brand-mark">
          <Logo size={54} />
          <div>
            <div className="brand-name">SOP PLATFORM</div>
            <div className="brand-sub">Hệ thống Quản lý Quy trình</div>
          </div>
        </div>
        <h1>Thiết kế quy trình theo phiên bản, thực hiện đúng phiên bản.</h1>
        <p className="lead">
          Quản lý nhiều quy trình độc lập, kiểm soát phiên bản chặt chẽ, thu thập
          bằng chứng và truy vết đầy đủ mọi thao tác — an toàn, minh bạch, có kiểm soát.
        </p>
        <ul className="brand-points">
          <li>
            <span className="tick">✓</span>
            <span>Phê duyệt nhiều cấp, nguyên tắc bốn mắt, tự phê duyệt có lưu vết kiểm tra</span>
          </li>
          <li>
            <span className="tick">✓</span>
            <span>Phân quyền theo vai trò và phạm vi đơn vị — mọi kiểm tra thực hiện phía máy chủ</span>
          </li>
          <li>
            <span className="tick">✓</span>
            <span>Nhật ký kiểm tra đầy đủ cho mọi thao tác nhạy cảm</span>
          </li>
        </ul>
        <div className="brand-foot">SOP Platform · An toàn · Minh bạch · Có kiểm soát</div>
      </div>

      <div className="login-form-wrap">
        <div className="login-main">
        <div className="login-card">
          <div className="card-logo">
            <Logo size={42} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>SOP PLATFORM</div>
              <div style={{ fontSize: '0.75rem', color: '#5b6b85' }}>Chào mừng trở lại</div>
            </div>
          </div>
          <h2>Đăng nhập</h2>
          <p className="hint">Dùng tài khoản nội bộ được cấp để tiếp tục.</p>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="username">Tên đăng nhập</label>
              <div className="input-wrap">
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="vd: admin"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="password">Mật khẩu</label>
              <div className="input-wrap">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{ paddingRight: '3.4rem' }}
                />
                <button
                  type="button"
                  className="toggle-pw"
                  onClick={() => setShowPw((v) => !v)}
                  tabIndex={-1}
                >
                  {showPw ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>
            <div className="login-options">
              <label className="remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Ghi nhớ đăng nhập (30 ngày)
              </label>
            </div>
            {error && <div className="form-error">{error}</div>}
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>
          <details className="demo-accounts">
            <summary>Tài khoản demo</summary>
            <table>
              <tbody>
                {DEMO_ACCOUNTS.map(([u, p, r]) => (
                  <tr key={u}>
                    <td>
                      <code>{u}</code>
                    </td>
                    <td>
                      <code>{p}</code>
                    </td>
                    <td>{r}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
        </div>
        <footer className="site-footer">
          © 2026 SOP Platform · Hệ thống Quản lý Quy trình<br />
          Bản demo T1.2 — dữ liệu mẫu, không dùng cho vận hành thật
        </footer>
      </div>
    </div>
  );
}

/* ---------------- Khung app sau đăng nhập ---------------- */
const NAV_ITEMS: { key: string; label: string; ico: string; live: boolean; tag?: string }[] = [
  { key: 'overview', label: 'Tổng quan', ico: '◉', live: true },
  { key: 'processes', label: 'Danh mục Quy trình', ico: '◈', live: true },
  { key: 'execution', label: 'Lượt Thực hiện', ico: '⬢', live: false, tag: 'T3' },
  { key: 'evidence', label: 'Bằng chứng', ico: '▣', live: false, tag: 'T4' },
  { key: 'exception', label: 'Ngoại lệ', ico: '⚠', live: false, tag: 'T5' },
  { key: 'report', label: 'Báo cáo', ico: '▤', live: false, tag: 'T6' },
];

const MODULES: { name: string; desc: string; live: boolean; tag: string; ico: string }[] = [
  {
    name: 'Xác thực & Phân quyền',
    desc: 'Đăng nhập nội bộ, phiên làm việc phía máy chủ, phân quyền theo vai trò và đơn vị.',
    live: true,
    tag: 'Đang chạy',
    ico: '◉',
  },
  {
    name: 'Danh mục Quy trình',
    desc: 'Soạn thảo, thẩm định, phê duyệt và phát hành phiên bản quy trình.',
    live: true,
    tag: 'Đang chạy',
    ico: '◈',
  },
  {
    name: 'Lượt Thực hiện',
    desc: 'Khởi tạo và vận hành lượt thực hiện theo đúng phiên bản quy trình.',
    live: false,
    tag: 'Sắp có · T3',
    ico: '⬢',
  },
  {
    name: 'Bằng chứng',
    desc: 'Thu thập, quét mã độc và lưu trữ bằng chứng theo từng bước.',
    live: false,
    tag: 'Sắp có · T4',
    ico: '▣',
  },
  {
    name: 'Ngoại lệ',
    desc: 'Ghi nhận, xử lý và phê duyệt ngoại lệ phát sinh khi thực hiện.',
    live: false,
    tag: 'Sắp có · T5',
    ico: '⚠',
  },
  {
    name: 'Báo cáo',
    desc: 'Tổng hợp tiến độ, xuất báo cáo và tra cứu nhật ký kiểm tra.',
    live: false,
    tag: 'Sắp có · T6',
    ico: '▤',
  },
];

function HomePage({ me, onLogout }: { me: MeResponse; onLogout: () => void }) {
  const groups = groupPermissions(me.permissions);
  const primaryRole = me.roles[0];
  const initial = me.user.displayName.charAt(0).toUpperCase();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [nav, setNav] = React.useState('overview');
  const today = new Date()
    .toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className={`app-shell${drawerOpen ? ' drawer-open' : ''}`}>
      <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      <aside className="sidebar">
        <button className="drawer-close" aria-label="Đóng menu" onClick={() => setDrawerOpen(false)}>
          ×
        </button>
        <div className="brand-mark">
          <Logo size={42} />
          <div>
            <div className="brand-name">SOP PLATFORM</div>
            <div className="brand-sub">Quản lý Quy trình</div>
          </div>
        </div>
        <nav>
          <div className="nav-label">Phân hệ</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`nav-item${nav === item.key ? ' active' : ''}`}
              disabled={!item.live}
              title={item.live ? item.label : `${item.label} — sắp ra mắt`}
              onClick={() => {
                setNav(item.key);
                setDrawerOpen(false);
              }}
            >
              <span className="ico">{item.ico}</span>
              {item.label}
              {!item.live && <span className="soon-tag">{item.tag}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="user-avatar">{initial}</div>
            <div>
              <div className="uname">{me.user.displayName}</div>
              <div className="urole">{primaryRole ? primaryRole.name : '—'}</div>
            </div>
          </div>
          <button className="btn-ghost-light" onClick={onLogout}>
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="mobile-topbar">
        <button className="hamburger" aria-label="Mở menu" onClick={() => setDrawerOpen(true)}>
          ☰
        </button>
        <div className="mt-brand">
          <Logo size={30} />
          <span>SOP PLATFORM</span>
        </div>
        <div className="spacer" />
        <div className="user-avatar sm">{initial}</div>
      </div>

      <main className="main">
        {nav === 'processes' ? (
          <ProcessesView perms={me.permissions} />
        ) : (
          <>
        <header className="topbar">
          <div>
            <div className="crumb">
              Trang chủ <span> / </span> <strong>Tổng quan</strong>
            </div>
            <h2 className="page-title">Tổng quan</h2>
            <p className="page-sub">
              Xin chào, <strong>{me.user.displayName}</strong> · Tài khoản{' '}
              <strong>{me.user.username}</strong> · Phiên làm việc đã được xác thực phía máy chủ.
            </p>
          </div>
          <div className="topbar-right">
            <span className="today">{today}</span>
            <span className="env-badge">DEMO</span>
          </div>
        </header>

        <div className="stat-grid">
          <div className="stat-card accent">
            <div className="k">Vai trò ứng dụng</div>
            <div>
              {me.roles.length > 0 ? me.roles.map((r) => (
                <span className="role-badge" key={r.id}>
                  {r.name}
                </span>
              )) : <span className="muted">—</span>}
            </div>
          </div>
          <div className="stat-card">
            <div className="k">Chức vụ</div>
            <div>
              {me.positions.length > 0 ? me.positions.map((p) => (
                <span className="scope-chip" key={p.id}>
                  {p.name}
                </span>
              )) : <span className="muted">—</span>}
            </div>
          </div>
          <div className="stat-card">
            <div className="k">Đơn vị được phép</div>
            <div>
              {me.scopes.map((s) => (
                <span className="scope-chip" key={s}>
                  {SCOPE_LABEL[s] ?? s}
                </span>
              ))}
            </div>
          </div>
          <div className="stat-card">
            <div className="k">Quyền hiệu lực</div>
            <div className="v-big">{me.permissions.length}</div>
          </div>
        </div>

        <section className="section">
          <h3>Quyền hiệu lực theo nhóm</h3>
          <p className="sec-desc">
            Danh sách quyền do máy chủ cấp — giao diện không tự suy quyền (BR-013).
          </p>
          {groups.map(([prefix, perms]) => (
            <div className="perm-group" key={prefix}>
              <div className="gtitle">{PERM_GROUP_LABEL[prefix] ?? prefix}</div>
              <div>
                {perms.map((p) => (
                  <span className="perm-tag" key={p}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="section">
          <h3>Lộ trình phân hệ</h3>
          <p className="sec-desc">Các phân hệ sẽ được mở dần theo từng giai đoạn triển khai.</p>
          <div className="module-grid">
            {MODULES.map((m) => (
              <div className={`module-card${m.live ? ' live' : ' locked'}`} key={m.name}>
                <div className="mico">{m.ico}</div>
                <div className="mname">{m.name}</div>
                <div className="mdesc">{m.desc}</div>
                <span className="soon">{m.tag}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="app-footer">
          © 2026 SOP Platform · Hệ thống Quản lý Quy trình<br />
          Bản demo T1.2 — dữ liệu mẫu, không dùng cho vận hành thật
        </footer>
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api('/auth/me')
      .then((d) => setMe(d as MeResponse))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  async function onLogout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setMe(null);
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <Logo size={64} />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="spinner" />
          Đang tải…
        </div>
      </div>
    );
  }

  // AC-11: chưa đăng nhập → trang giới thiệu + đăng nhập, không tải dữ liệu nội bộ.
  if (!me) return <LoginPage onLogin={setMe} />;
  return <HomePage me={me} onLogout={onLogout} />;
}
