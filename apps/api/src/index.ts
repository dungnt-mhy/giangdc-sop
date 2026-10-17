import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_CONTRACT_VERSION, type HealthResponse } from '@giangdc-sop/contracts';
import { authApp } from './auth.js';
import { processApp } from './processes.js';
import { executionApp } from './executions.js';
import { errorBody, requestId } from './middleware.js';
import type { AppEnv } from './env.js';

const app = new Hono<AppEnv>();

app.use('*', requestId);

// CORS cho web demo (Pages). Production sẽ khóa origin cụ thể qua biến môi trường.
// Demo hiện tại: cho phép mọi subdomain *.pages.dev vì mỗi lần deploy preview
// Cloudflare sinh một URL hash mới (vd: f54a1129.giangdc-sop-demo.pages.dev).
app.use(
  '*',
  cors({
    origin: (origin: string, c) => {
      const allowed = (c.env.CORS_ORIGIN ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (allowed.includes(origin)) return origin;
      if (/^https:\/\/[a-z0-9.-]+\.pages\.dev$/.test(origin)) return origin;
      return null;
    },
    credentials: true,
  }),
);

app.get('/health', (c) => {
  const body: HealthResponse = {
    status: 'ok',
    version: '0.1.0',
    contract: API_CONTRACT_VERSION,
  };
  return c.json(body);
});

app.route('/auth', authApp);
app.route('/', processApp);
app.route('/', executionApp);

app.notFound((c) => {
  const requestId = c.get('requestId') as string;
  return c.json(errorBody('NOT_FOUND', 'Không tìm thấy tài nguyên.', requestId), 404);
});

app.onError((err, c) => {
  const requestId = (c.get('requestId') as string) ?? 'unknown';
  // Không lộ stack trace ra ngoài (SRS §12.2).
  console.error(`[${requestId}]`, err);
  return c.json(errorBody('INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống.', requestId), 500);
});

export default app;
