import type { DnsResolver, HttpTransport, TransportRequest, TransportResponse } from './safe-fetch';

/** Fixture/mock cho test: KHÔNG gọi mạng thật. Mọi tên miền dưới đây là miền ví dụ (`example.vn`/`example.com`). */

export interface FakePage {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  truncated?: boolean;
  /** Lỗi ném ra thay vì trả phản hồi. */
  error?: Error;
}

export function htmlPage(body: string, extra: Partial<FakePage> = {}): FakePage {
  return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body, ...extra };
}

export function redirectTo(location: string, status = 302): FakePage {
  return { status, headers: { location }, body: '' };
}

export interface FakeNetwork {
  transport: HttpTransport;
  resolver: DnsResolver;
  /** Mọi yêu cầu transport đã nhận (để kiểm địa chỉ ghim, header, thứ tự). */
  requests: TransportRequest[];
  resolved: string[];
}

/**
 * Mạng giả: `pages` khóa theo URL đầy đủ (`https://host/path`); `dns` khóa theo tên máy.
 * URL không có trong `pages` → 404 để test robots.txt không cần khai báo.
 */
export function createFakeNetwork(
  pages: Record<string, FakePage>,
  dns: Record<string, string[]> = {},
): FakeNetwork {
  const requests: TransportRequest[] = [];
  const resolved: string[] = [];
  return {
    requests,
    resolved,
    resolver: {
      async resolve(hostname) {
        resolved.push(hostname);
        const addresses = dns[hostname];
        if (!addresses) throw new Error(`NXDOMAIN ${hostname}`);
        return addresses;
      },
    },
    transport: {
      async request(request): Promise<TransportResponse> {
        requests.push(request);
        const page = pages[request.url.href] ?? {
          status: 404,
          headers: { 'content-type': 'text/plain' },
          body: '',
        };
        if (page.error) throw page.error;
        return {
          status: page.status ?? 200,
          headers: page.headers ?? {},
          body: new TextEncoder().encode(page.body ?? ''),
          truncated: page.truncated ?? false,
        };
      },
    },
  };
}
