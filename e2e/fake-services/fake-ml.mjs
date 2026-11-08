// DỊCH VỤ /embed GIẢ CHỈ CHO CI/E2E — chạy NGOÀI ứng dụng, đúng giao thức dịch vụ `ml` (POST /embed → {model, dimensions, vectors}).
// Vector CỐ ĐỊNH theo văn bản (xác định, 1024 chiều); model mặc định `bge-m3-test`. Ứng dụng dùng client THẬT (`createMlEmbedder`) và chỉ trỏ ML_URL
// sang đây. KẾT QUẢ KHÔNG PHẢI SỐ ĐO CHẤT LƯỢNG (docs/testing/dich-vu-gia-ci.md).
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FAKE_ML_MODEL = 'bge-m3-test';
const DIMENSIONS = 1024;

/** Vector đơn vị xác định: một thành phần = 1 tại vị trí băm của văn bản. */
export function fakeVector(text) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const v = new Array(DIMENSIONS).fill(0);
  v[h % DIMENSIONS] = 1;
  return v;
}

export function createFakeMl(model = process.env.FAKE_ML_MODEL || FAKE_ML_MODEL) {
  return createServer((request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.method === 'GET' && request.url === '/health') return send(200, { ok: true });
    if (request.method !== 'POST' || request.url !== '/embed')
      return send(404, { error: 'not found' });
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => {
      let texts;
      try {
        texts = JSON.parse(Buffer.concat(chunks).toString('utf8')).texts;
      } catch {
        return send(400, { error: 'invalid json' });
      }
      if (!Array.isArray(texts)) return send(400, { error: 'texts phải là mảng' });
      send(200, {
        model,
        dimensions: DIMENSIONS,
        vectors: texts.map((t) => fakeVector(String(t))),
      });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createFakeMl();
  server.listen(Number(process.argv[2] ?? 0), '127.0.0.1', () => {
    console.log(`listening ${server.address().port}`);
  });
}
