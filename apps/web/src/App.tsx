import React from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

interface MeResponse {
  user: { id: string; username: string; displayName: string };
  roles: string[];
  permissions: string[];
  scopes: string[];
}

async function api(path: string, init?: RequestInit) {
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

const ROLE_LABEL: Record<string, string> = {
  admin: 'Quản trị',
  manager: 'Quản lý',
  approver: 'Người phê duyệt',
  author: 'Người soạn',
  reviewer: 'Người thẩm định',
  supervisor: 'Giám sát',
  viewer: 'Người xem',
};

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

function LoginPage({ onLogin }: { onLogin: (me: MeResponse) => void }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
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
          <div className="brand-logo">S</div>
          <div>
            <div className="brand-name">SOP PLATFORM</div>
            <div className="brand-sub">Hệ thống Quản lý Quy trình</div>
          </div>
        </div>
        <h1>Thiết kế quy trình theo phiên bản, thực hiện đúng phiên bản.</h1>
        <p className="lead">
          Quản lý nhiều quy trình độc lập, kiểm soát phiên bản chặt chẽ, thu thập
          bằng chứng và truy vết đầy đủ mọi thao tác.
        </p>
        <ul className="brand-points">
          <li>
            <span className="tick">✓</span>
            <span>Phê duyệt nhiều cấp, nguyên tắc bốn mắt, tự phê duyệt có lưu vết kiểm tra</span>
          </li>
          <li>
            <span className="tick">✓</span>
            <span>Phân quyền theo vai trò và phạm vi đơn vị — kiểm tra phía máy chủ</span>
          </li>
          <li>
            <span className="tick">✓</span>
            <span>Nhật ký kiểm tra đầy đủ cho mọi thao tác nhạy cảm</span>
          </li>
        </ul>
      </div>

      <div className="login-form-wrap">
        <div className="login-card">
          <h2>Đăng nhập</h2>
          <p className="hint">Dùng tài khoản nội bộ được cấp để tiếp tục.</p>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="username">Tên đăng nhập</label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="vd: admin"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Mật khẩu</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
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
    </div>
  );
}

const MODULES: { name: string; desc: string; live: boolean; tag: string }[] = [
  {
    name: 'Xác thực & Phân quyền',
    desc: 'Đăng nhập nội bộ, phiên làm việc phía máy chủ, phân quyền theo vai trò và đơn vị.',
    live: true,
    tag: 'Đang chạy',
  },
  {
    name: 'Danh mục Quy trình',
    desc: 'Soạn thảo, thẩm định, phê duyệt và phát hành phiên bản quy trình.',
    live: false,
    tag: 'Sắp có · T2',
  },
  {
    name: 'Lượt Thực hiện',
    desc: 'Khởi tạo và vận hành lượt thực hiện theo đúng phiên bản quy trình.',
    live: false,
    tag: 'Sắp có · T3',
  },
  {
    name: 'Bằng chứng',
    desc: 'Thu thập, quét mã độc và lưu trữ bằng chứng theo từng bước.',
    live: false,
    tag: 'Sắp có · T4',
  },
  {
    name: 'Ngoại lệ',
    desc: 'Ghi nhận, xử lý và phê duyệt ngoại lệ phát sinh khi thực hiện.',
    live: false,
    tag: 'Sắp có · T5',
  },
  {
    name: 'Báo cáo',
    desc: 'Tổng hợp tiến độ, xuất báo cáo và tra cứu nhật ký kiểm tra.',
    live: false,
    tag: 'Sắp có · T6',
  },
];

function HomePage({ me, onLogout }: { me: MeResponse; onLogout: () => void }) {
  const groups = groupPermissions(me.permissions);
  return (
    <>
      <header className="navbar">
        <div className="brand">
          <div className="brand-logo">S</div>
          <div>
            <div className="brand-name">SOP PLATFORM</div>
          </div>
        </div>
        <div className="who">
          <span className="hello">
            Xin chào, <strong>{me.user.displayName}</strong>
          </span>
          <button className="btn-ghost" onClick={onLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      <main className="page">
        <h2 className="page-title">Tổng quan</h2>
        <p className="page-sub">
          Tài khoản <strong>{me.user.username}</strong> · Phiên làm việc đã được xác thực phía máy chủ.
        </p>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="k">Vai trò</div>
            <div>
              {me.roles.map((r) => (
                <span className="role-badge" key={r}>
                  {ROLE_LABEL[r] ?? r}
                </span>
              ))}
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
            <div className="v">{me.permissions.length}</div>
          </div>
        </div>

        <section className="section">
          <h3>Quyền hiệu lực theo nhóm</h3>
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
          <h3>Phân hệ</h3>
          <div className="module-grid">
            {MODULES.map((m) => (
              <div className={`module-card${m.live ? ' live' : ''}`} key={m.name}>
                <div className="mname">{m.name}</div>
                <div className="mdesc">{m.desc}</div>
                <span className="soon">{m.tag}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="footer-note">
          SOP Platform · Bản demo T1.2 · Dữ liệu mẫu, không dùng cho vận hành thật
        </p>
      </main>
    </>
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
        <div className="spinner" />
        Đang tải…
      </div>
    );
  }

  // AC-11: chưa đăng nhập → trang giới thiệu + đăng nhập, không tải dữ liệu nội bộ.
  if (!me) return <LoginPage onLogin={setMe} />;
  return <HomePage me={me} onLogout={onLogout} />;
}
