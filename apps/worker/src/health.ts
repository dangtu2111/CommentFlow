import { createServer, type Server } from 'node:http';

export type HealthServer = { server: Server; close: () => Promise<void> };

/** Máy chủ HTTP nhỏ chỉ có `GET /health`, dùng cho health check của Docker/Compose. */
export function startHealthServer(options: {
  port: number;
  isReady: () => boolean;
}): Promise<HealthServer> {
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      const ready = options.isReady();
      response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: ready ? 'ok' : 'starting', service: 'worker' }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'NOT_FOUND' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, () => {
      resolve({
        server,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
