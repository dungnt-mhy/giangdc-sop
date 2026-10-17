import { Hono } from 'hono';
import { API_CONTRACT_VERSION, type HealthResponse } from '@giangdc-sop/contracts';

const app = new Hono();

app.get('/health', (c) => {
  const body: HealthResponse = {
    status: 'ok',
    version: '0.1.0',
    contract: API_CONTRACT_VERSION,
  };
  return c.json(body);
});

app.get('/', (c) => c.text('giangdc-sop API — see /health'));

export default app;
