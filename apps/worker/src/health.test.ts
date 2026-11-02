import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startHealthServer } from './health';

const servers: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function start(isReady: () => boolean) {
  const health = await startHealthServer({ port: 0, isReady });
  servers.push(health);
  const { port } = health.server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe('máy chủ health của worker', () => {
  it('GET /health trả 200 khi sẵn sàng', async () => {
    const base = await start(() => true);
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'worker' });
  });

  it('GET /health trả 503 khi chưa sẵn sàng', async () => {
    const base = await start(() => false);
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(503);
  });

  it('đường dẫn khác trả 404', async () => {
    const base = await start(() => true);
    expect((await fetch(`${base}/khac`)).status).toBe(404);
  });
});
