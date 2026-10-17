import type { SystemRole } from '@giangdc-sop/domain';
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
  roles?: SystemRole[];
}

/** Kiểu Hono dùng chung cho toàn bộ API. */
export interface AppEnv {
  Bindings: Env;
  Variables: AppVariables;
}
