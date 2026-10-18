/**
 * Hash-routing cho web SOP (fix lỗi refresh về trang tổng quan).
 *
 * Định dạng hash:
 *   #/                        → Tổng quan
 *   #/processes                → Danh sách quy trình
 *   #/processes/{processId}    → Chi tiết 1 quy trình
 *   #/processes/{processId}/edit/{versionId}   → Soạn thảo bản
 *   #/processes/{processId}/review/{versionId} → Xem/thẩm định bản
 *   #/executions               → Danh sách lượt thực hiện
 *   #/executions/{executionId} → Chi tiết 1 lượt
 *   #/reports                  → Báo cáo/KPI (T6)
 *   #/admin                    → Quản trị hệ thống (T7)
 *
 * Dùng hash (thay vì history API) vì app deploy dạng static trên Cloudflare Pages —
 * refresh ở bất kỳ hash nào cũng vẫn tải index.html, không cần cấu hình redirect.
 */

export type Route =
  | { nav: 'overview' }
  | { nav: 'processes'; processId?: string; mode?: 'edit' | 'review'; versionId?: string }
  | { nav: 'executions'; executionId?: string }
  | { nav: 'reports' }
  | { nav: 'admin' }
  | { nav: 'evidence' }
  | { nav: 'exceptions' };

/** Đọc route hiện tại từ location.hash. Hash lạ/không hợp lệ → overview. */
export function parseHash(hash?: string): Route {
  const raw = (hash ?? (typeof window !== 'undefined' ? window.location.hash : '')).replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] === 'processes') {
    const processId = parts[1];
    if (!processId) return { nav: 'processes' };
    const mode = parts[2];
    const versionId = parts[3];
    if ((mode === 'edit' || mode === 'review') && versionId) {
      return { nav: 'processes', processId, mode, versionId };
    }
    return { nav: 'processes', processId };
  }
  if (parts[0] === 'executions') {
    const executionId = parts[1];
    return executionId ? { nav: 'executions', executionId } : { nav: 'executions' };
  }
  if (parts[0] === 'reports') {
    return { nav: 'reports' };
  }
  if (parts[0] === 'admin') {
    return { nav: 'admin' };
  }
  if (parts[0] === 'evidence') {
    return { nav: 'evidence' };
  }
  if (parts[0] === 'exceptions') {
    return { nav: 'exceptions' };
  }
  return { nav: 'overview' };
}

/** Route → chuỗi hash (luôn bắt đầu bằng '#/'). */
export function toHash(r: Route): string {
  if (r.nav === 'processes') {
    if (r.processId) {
      if (r.mode && r.versionId) return `#/processes/${r.processId}/${r.mode}/${r.versionId}`;
      return `#/processes/${r.processId}`;
    }
    return '#/processes';
  }
  if (r.nav === 'executions') {
    return r.executionId ? `#/executions/${r.executionId}` : '#/executions';
  }
  if (r.nav === 'reports') {
    return '#/reports';
  }
  if (r.nav === 'admin') {
    return '#/admin';
  }
  if (r.nav === 'evidence') {
    return '#/evidence';
  }
  if (r.nav === 'exceptions') {
    return '#/exceptions';
  }
  return '#/';
}

/**
 * Gán hash mới (chỉ khi khác hash hiện tại để tránh vòng lặp hashchange).
 * Trả về true nếu đã đổi hash.
 */
export function setHash(h: string): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.hash === h) return false;
  window.location.hash = h;
  return true;
}
