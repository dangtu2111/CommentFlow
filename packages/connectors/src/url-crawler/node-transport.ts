import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { UrlCrawlError } from './errors';
import type { DnsResolver, HttpTransport, TransportRequest, TransportResponse } from './safe-fetch';

type LookupFn = (hostname: string) => Promise<{ address: string; family: number }[]>;

/** Phân giải DNS bằng hệ thống (A + AAAA). Hàm tra cứu tiêm được để test không ra mạng. */
export function createNodeDnsResolver(
  lookup: LookupFn = (hostname) => dnsLookup(hostname, { all: true }),
): DnsResolver {
  return {
    async resolve(hostname) {
      return (await lookup(hostname)).map((entry) => entry.address);
    },
  };
}

type LookupCallback = (...args: unknown[]) => void;

/** Hàm `lookup` của Node bị ghim: dù được hỏi tên miền nào cũng trả đúng IP đã kiểm (cả dạng `all` lẫn một địa chỉ). */
export function pinnedLookup(address: string, family: number) {
  return (_hostname: string, options: { all?: boolean }, callback: LookupCallback): void => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

function flattenHeaders(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (value !== undefined)
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
}

/**
 * Bộ chuyển thật bằng `node:http(s)`: kết nối thẳng tới `address` đã kiểm (hàm `lookup` bị ghim nên Node không
 * phân giải lại), vẫn gửi `Host`/SNI theo tên miền; đọc theo luồng, dừng ngay khi vượt `maxBytes`; hạn chót tổng
 * thể `timeoutMs` (kể cả thân chảy chậm); không theo chuyển hướng; không tái dùng kết nối (`agent: false`).
 */
export function createNodeTransport(): HttpTransport {
  return {
    request(request: TransportRequest): Promise<TransportResponse> {
      const { url, address, headers, timeoutMs, maxBytes } = request;
      const family = isIP(address);
      const send = url.protocol === 'https:' ? httpsRequest : httpRequest;

      return new Promise<TransportResponse>((resolve, reject) => {
        let settled = false;
        const finish = (action: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          action();
        };
        const req = send({
          protocol: url.protocol,
          hostname: url.hostname.replace(/^\[|\]$/g, ''),
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers,
          agent: false,
          lookup: pinnedLookup(address, family) as never,
        });
        const deadline = setTimeout(() => {
          finish(() => reject(new UrlCrawlError('TIMEOUT')));
          req.destroy();
        }, timeoutMs);

        req.on('error', (cause) =>
          finish(() => reject(new UrlCrawlError('NETWORK_ERROR', { cause }))),
        );
        req.on('response', (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            const room = maxBytes - size;
            if (chunk.length >= room) {
              chunks.push(chunk.subarray(0, room));
              size = maxBytes;
              const truncated = chunk.length > room || !res.complete;
              finish(() =>
                resolve(buildResponse(res.statusCode ?? 0, res.headers, chunks, truncated)),
              );
              req.destroy();
              return;
            }
            chunks.push(chunk);
            size += chunk.length;
          });
          res.on('end', () =>
            finish(() => resolve(buildResponse(res.statusCode ?? 0, res.headers, chunks, false))),
          );
          res.on('error', (cause) =>
            finish(() => reject(new UrlCrawlError('NETWORK_ERROR', { cause }))),
          );
        });
        req.end();
      });
    },
  };
}

function buildResponse(
  status: number,
  headers: Record<string, string | string[] | undefined>,
  chunks: Buffer[],
  truncated: boolean,
): TransportResponse {
  return {
    status,
    headers: flattenHeaders(headers),
    body: new Uint8Array(Buffer.concat(chunks)),
    truncated,
  };
}
