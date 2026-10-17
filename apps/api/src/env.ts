import type { DbRole } from './db.js';
import type { Env } from './db.js';

export interface AuthSession {
  session_id: string;
  user_id: string;
  username: string;
  display_name: string;
}

export interface AppVariables {
  requestId: string;
  session?: AuthSession;
  /** Vai trò ứng dụng của user (D-10: bảng `roles`). */
  roles?: DbRole[];
  /** Quyền hiệu lực (hợp từ `role_permissions`). */
  permissions?: string[];
  /** true khi user có vai trò senior_approver (D-10). */
  seniorApprover?: boolean;
}

/** Kiểu Hono dùng chung cho toàn bộ API. */
export interface AppEnv {
  Bindings: Env;
  Variables: AppVariables;
}
