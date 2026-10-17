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

const box: React.CSSProperties = {
  fontFamily: 'system-ui',
  maxWidth: 480,
  margin: '4rem auto',
  padding: '2rem',
  border: '1px solid #ddd',
  borderRadius: 12,
};

const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.6rem',
  margin: '0.5rem 0 1rem',
  fontSize: '1rem',
};

const btn: React.CSSProperties = {
  padding: '0.6rem 1.4rem',
  fontSize: '1rem',
  cursor: 'pointer',
};

function RoleBadge({ role }: { role: string }) {
  const label: Record<string, string> = {
    admin: 'Quản trị',
    manager: 'Quản lý',
    approver: 'Người phê duyệt',
    author: 'Người soạn',
    reviewer: 'Người thẩm định',
    supervisor: 'Giám sát',
    viewer: 'Người xem',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        background: '#eef',
        border: '1px solid #99c',
        borderRadius: 999,
        padding: '0.15rem 0.7rem',
        margin: '0.15rem',
        fontSize: '0.85rem',
      }}
    >
      {label[role] ?? role}
    </span>
  );
}

export default function App() {
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    api('/auth/me')
      .then((d) => setMe(d as MeResponse))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      const d = (await api('/auth/me')) as MeResponse;
      setMe(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    }
  }

  async function onLogout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setMe(null);
    setPassword('');
  }

  if (loading) {
    return (
      <main style={box}>
        <p>Đang tải…</p>
      </main>
    );
  }

  // AC-11: chưa đăng nhập -> trang giới thiệu + hành động đăng nhập nổi bật,
  // không tải dữ liệu nghiệp vụ nội bộ.
  if (!me) {
    return (
      <main style={box}>
        <h1>Hệ thống Quản lý Quy trình</h1>
        <p>
          Quản lý nhiều quy trình độc lập, kiểm soát phiên bản, thực hiện theo đúng
          phiên bản, thu thập bằng chứng và truy vết đầy đủ.
        </p>
        <form onSubmit={onLogin}>
          <label>
            Tên đăng nhập
            <input
              style={input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Mật khẩu
            <input
              style={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
          <button style={btn} type="submit">
            Đăng nhập
          </button>
        </form>
      </main>
    );
  }

  // AC-11: trang chủ theo vai trò — chỉ hiển thị thứ người dùng có quyền xem.
  return (
    <main style={{ ...box, maxWidth: 720 }}>
      <h1>Xin chào, {me.user.displayName}</h1>
      <p>
        Vai trò:{' '}
        {me.roles.map((r) => (
          <RoleBadge key={r} role={r} />
        ))}
      </p>
      <p>Đơn vị được phép: {me.scopes.join(', ') || '—'}</p>
      <details>
        <summary>Quyền hiệu lực ({me.permissions.length})</summary>
        <ul>
          {me.permissions.map((p) => (
            <li key={p}>
              <code>{p}</code>
            </li>
          ))}
        </ul>
      </details>
      <p style={{ marginTop: '1.5rem' }}>
        <button style={btn} onClick={onLogout}>
          Đăng xuất
        </button>
      </p>
    </main>
  );
}
