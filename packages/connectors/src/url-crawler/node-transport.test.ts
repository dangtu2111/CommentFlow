import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UrlCrawlError } from './errors';
import { createNodeDnsResolver, createNodeTransport, pinnedLookup } from './node-transport';

// Máy chủ CỤC BỘ (127.0.0.1, cổng ngẫu nhiên) chỉ để thử bộ chuyển thật; không ra mạng ngoài.
let server: Server;
let port: number;
const seen: { host?: string | undefined; agent?: string | undefined }[] = [];

function handler(req: IncomingMessage, res: ServerResponse) {
  seen.push({ host: req.headers.host, agent: req.headers['user-agent'] });
  if (req.url === '/big') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.write('a'.repeat(5000));
    res.end('b'.repeat(5000));
  } else if (req.url === '/slow') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.write('đầu');
    // không bao giờ kết thúc
  } else if (req.url === '/hang') {
    // không trả lời
  } else if (req.url === '/reset') {
    res.writeHead(200, { 'content-type': 'text/html', 'content-length': '100' });
    res.write('đầu');
    setTimeout(() => res.destroy(), 20);
  } else if (req.url === '/redirect') {
    res.writeHead(302, { location: '/ok', 'x-lap': ['1', '2'] });
    res.end();
  } else {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<p>xin chào</p>');
  }
}

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function request(
  path: string,
  overrides: { timeoutMs?: number; maxBytes?: number; host?: string; scheme?: string } = {},
) {
  return createNodeTransport().request({
    url: new URL(
      `${overrides.scheme ?? 'http'}://${overrides.host ?? 'shop.example.vn'}:${port}${path}`,
    ),
    address: '127.0.0.1',
    headers: { 'user-agent': 'CommentFlowBot/1.0' },
    timeoutMs: overrides.timeoutMs ?? 2000,
    maxBytes: overrides.maxBytes ?? 100_000,
  });
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof UrlCrawlError ? error.reason : `khac:${String(error)}`;
  }
  return 'khong-loi';
}

describe('FR-053 createNodeTransport (máy chủ cục bộ, không ra mạng)', () => {
  it('kết nối tới IP đã ghim nhưng gửi Host theo tên miền; trả trạng thái, header viết thường, thân', async () => {
    const response = await request('/ok');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(new TextDecoder().decode(response.body)).toBe('<p>xin chào</p>');
    expect(response.truncated).toBe(false);
    expect(seen.at(-1)).toEqual({ host: `shop.example.vn:${port}`, agent: 'CommentFlowBot/1.0' });
  });

  it('không tự theo chuyển hướng; gộp header nhiều giá trị', async () => {
    const response = await request('/redirect');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/ok');
    expect(response.headers['x-lap']).toBe('1, 2');
  });

  it('cắt thân khi vượt maxBytes và báo truncated', async () => {
    const response = await request('/big', { maxBytes: 1000 });
    expect(response.truncated).toBe(true);
    expect(response.body.byteLength).toBe(1000);
  });

  it('hết hạn tổng thể (kể cả khi thân chảy chậm) → TIMEOUT', async () => {
    expect(await reasonOf(request('/hang', { timeoutMs: 100 }))).toBe('TIMEOUT');
    expect(await reasonOf(request('/slow', { timeoutMs: 150 }))).toBe('TIMEOUT');
  });

  it('máy chủ ngắt giữa chừng khi đang gửi thân → NETWORK_ERROR', async () => {
    expect(await reasonOf(request('/reset'))).toBe('NETWORK_ERROR');
  });

  it('lỗi kết nối → NETWORK_ERROR (cổng đóng, hoặc nói https với máy chủ http thuần)', async () => {
    const closed = createNodeTransport().request({
      url: new URL('http://shop.example.vn:1/'),
      address: '127.0.0.1',
      headers: {},
      timeoutMs: 1000,
      maxBytes: 100,
    });
    expect(await reasonOf(closed)).toBe('NETWORK_ERROR');
    expect(await reasonOf(request('/ok', { scheme: 'https' }))).toBe('NETWORK_ERROR');
  });

  it('IPv6 đã ghim cũng được nhận (kết nối thất bại gọn gàng nếu máy không có IPv6 loopback)', async () => {
    const result = await reasonOf(
      createNodeTransport().request({
        url: new URL(`http://shop.example.vn:${port}/ok`),
        address: '::1',
        headers: {},
        timeoutMs: 1000,
        maxBytes: 100,
      }),
    );
    expect(['NETWORK_ERROR', 'khong-loi']).toContain(result);
  });
});

describe('FR-053 pinnedLookup — ghim IP chống DNS rebinding', () => {
  it('luôn trả IP đã kiểm bất kể tên miền được hỏi, ở cả hai dạng gọi của Node', () => {
    const calls: unknown[][] = [];
    const lookup = pinnedLookup('93.184.216.34', 4);
    lookup('evil.example.com', { all: true }, (...args) => void calls.push(args));
    lookup('evil.example.com', {}, (...args) => void calls.push(args));
    expect(calls).toEqual([
      [null, [{ address: '93.184.216.34', family: 4 }]],
      [null, '93.184.216.34', 4],
    ]);
  });
});

describe('FR-053 createNodeDnsResolver', () => {
  it('trả danh sách địa chỉ từ hàm tra cứu được tiêm', async () => {
    const resolver = createNodeDnsResolver(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
    expect(await resolver.resolve('shop.example.vn')).toEqual([
      '93.184.216.34',
      '2606:4700:4700::1111',
    ]);
  });

  it('mặc định dùng dns hệ thống: tên "localhost" trả địa chỉ loopback (không ra mạng)', async () => {
    const addresses = await createNodeDnsResolver().resolve('localhost');
    expect(addresses.length).toBeGreaterThan(0);
  });
});
