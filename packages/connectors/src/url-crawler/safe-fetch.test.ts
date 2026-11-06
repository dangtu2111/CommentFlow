import { describe, expect, it } from 'vitest';
import { UrlCrawlError } from './errors';
import { createFakeNetwork, htmlPage, redirectTo } from './fixtures';
import { safeFetch } from './safe-fetch';

const PUBLIC = ['93.184.216.34'];
const OPTIONS = { userAgent: 'CommentFlowBot/1.0 (+https://example.vn/bot)' };

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof UrlCrawlError ? error.reason : `khac:${String(error)}`;
  }
  return 'khong-loi';
}

describe('FR-053 safeFetch', () => {
  it('tải trang: phân giải DNS, kết nối thẳng tới IP đã kiểm, gửi User-Agent riêng + Accept-Encoding identity', async () => {
    const net = createFakeNetwork(
      { 'https://shop.example.vn/doi-tra': htmlPage('<p>Xin chào</p>') },
      { 'shop.example.vn': PUBLIC },
    );
    const result = await safeFetch('https://shop.example.vn/doi-tra', net, OPTIONS);
    expect(new TextDecoder().decode(result.body)).toBe('<p>Xin chào</p>');
    expect(result.status).toBe(200);
    expect(result.contentType).toBe('text/html');
    expect(result.finalUrl.href).toBe('https://shop.example.vn/doi-tra');
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]!.address).toBe('93.184.216.34');
    expect(net.requests[0]!.headers['user-agent']).toBe(OPTIONS.userAgent);
    expect(net.requests[0]!.headers['accept-encoding']).toBe('identity');
    expect(net.requests[0]!.timeoutMs).toBe(15_000);
    expect(net.requests[0]!.maxBytes).toBe(1_048_576);
  });

  it('từ chối nếu BẤT KỲ địa chỉ DNS nào là nội bộ; không gửi yêu cầu nào', async () => {
    const net = createFakeNetwork({}, { 'evil.example.com': ['93.184.216.34', '169.254.169.254'] });
    expect(await reasonOf(safeFetch('https://evil.example.com/', net, OPTIONS))).toBe(
      'HOST_BLOCKED',
    );
    expect(net.requests).toHaveLength(0);
  });

  it('DNS lỗi hoặc trả rỗng → DNS_FAILED', async () => {
    const net = createFakeNetwork({}, { 'empty.example.com': [] });
    expect(await reasonOf(safeFetch('https://nxdomain.example.com/', net, OPTIONS))).toBe(
      'DNS_FAILED',
    );
    expect(await reasonOf(safeFetch('https://empty.example.com/', net, OPTIONS))).toBe(
      'DNS_FAILED',
    );
  });

  it('URL không hợp lệ bị từ chối trước khi phân giải DNS', async () => {
    const net = createFakeNetwork({});
    expect(await reasonOf(safeFetch('http://127.0.0.1/', net, OPTIONS))).toBe('HOST_BLOCKED');
    expect(await reasonOf(safeFetch('ftp://shop.example.vn/', net, OPTIONS))).toBe(
      'SCHEME_NOT_ALLOWED',
    );
    expect(net.resolved).toEqual([]);
  });

  it('IP công cộng viết thẳng trong URL: không phân giải DNS, vẫn kết nối thẳng', async () => {
    const net = createFakeNetwork({ 'http://93.184.216.34/': htmlPage('ok') });
    await safeFetch('http://93.184.216.34/', net, OPTIONS);
    expect(net.resolved).toEqual([]);
    expect(net.requests[0]!.address).toBe('93.184.216.34');
    const v6 = createFakeNetwork({ 'http://[2606:4700:4700::1111]/': htmlPage('ok') });
    await safeFetch('http://[2606:4700:4700::1111]/', v6, OPTIONS);
    expect(v6.requests[0]!.address).toBe('2606:4700:4700::1111');
  });

  it('theo chuyển hướng (kiểm lại từng chặng), phân giải link tương đối', async () => {
    const net = createFakeNetwork(
      {
        'https://shop.example.vn/a': redirectTo('/b'),
        'https://shop.example.vn/b': redirectTo('https://www.example.vn/c', 301),
        'https://www.example.vn/c': htmlPage('đến nơi'),
      },
      { 'shop.example.vn': PUBLIC, 'www.example.vn': PUBLIC },
    );
    const result = await safeFetch('https://shop.example.vn/a', net, OPTIONS);
    expect(result.finalUrl.href).toBe('https://www.example.vn/c');
    expect(net.resolved).toEqual(['shop.example.vn', 'shop.example.vn', 'www.example.vn']);
  });

  it('chuyển hướng sang IP/máy nội bộ bị chặn (SSRF qua redirect)', async () => {
    const net = createFakeNetwork(
      { 'https://shop.example.vn/a': redirectTo('http://169.254.169.254/latest/meta-data/') },
      { 'shop.example.vn': PUBLIC },
    );
    expect(await reasonOf(safeFetch('https://shop.example.vn/a', net, OPTIONS))).toBe(
      'HOST_BLOCKED',
    );
    expect(net.requests).toHaveLength(1);
    const toFile = createFakeNetwork(
      { 'https://shop.example.vn/a': redirectTo('file:///etc/passwd') },
      { 'shop.example.vn': PUBLIC },
    );
    expect(await reasonOf(safeFetch('https://shop.example.vn/a', toFile, OPTIONS))).toBe(
      'SCHEME_NOT_ALLOWED',
    );
  });

  it('chuyển hướng sang tên miền dùng DNS trỏ nội bộ (DNS rebinding) bị chặn', async () => {
    const net = createFakeNetwork(
      { 'https://shop.example.vn/a': redirectTo('https://rebind.example.com/') },
      { 'shop.example.vn': PUBLIC, 'rebind.example.com': ['10.0.0.8'] },
    );
    expect(await reasonOf(safeFetch('https://shop.example.vn/a', net, OPTIONS))).toBe(
      'HOST_BLOCKED',
    );
  });

  it('tối đa 3 lần chuyển hướng; Location hỏng → INVALID_URL; thiếu Location → trả nguyên phản hồi 3xx', async () => {
    const pages: Record<string, ReturnType<typeof redirectTo>> = {};
    for (let i = 0; i < 6; i += 1) pages[`https://shop.example.vn/${i}`] = redirectTo(`/${i + 1}`);
    const net = createFakeNetwork(pages, { 'shop.example.vn': PUBLIC });
    expect(await reasonOf(safeFetch('https://shop.example.vn/0', net, OPTIONS))).toBe(
      'REDIRECT_LIMIT',
    );
    expect(net.requests).toHaveLength(4);

    const bad = createFakeNetwork(
      { 'https://shop.example.vn/a': redirectTo('http://') },
      { 'shop.example.vn': PUBLIC },
    );
    expect(await reasonOf(safeFetch('https://shop.example.vn/a', bad, OPTIONS))).toBe(
      'INVALID_URL',
    );

    const none = createFakeNetwork(
      { 'https://shop.example.vn/a': { status: 304, headers: {} } },
      { 'shop.example.vn': PUBLIC },
    );
    expect((await safeFetch('https://shop.example.vn/a', none, OPTIONS)).status).toBe(304);
  });

  it('giới hạn miền: chỉ miền (và miền con) Owner khai báo, kiểm cả ở mỗi chặng chuyển hướng', async () => {
    const net = createFakeNetwork(
      {
        'https://shop.example.vn/a': htmlPage('ok'),
        'https://www.shop.example.vn/a': htmlPage('ok'),
        'https://shop.example.vn/out': redirectTo('https://khac.example.com/'),
      },
      {
        'shop.example.vn': PUBLIC,
        'www.shop.example.vn': PUBLIC,
        'khac.example.com': PUBLIC,
        'notshop.example.vn': PUBLIC,
      },
    );
    const options = { ...OPTIONS, allowedDomains: ['Shop.Example.vn'] };
    await safeFetch('https://shop.example.vn/a', net, options);
    await safeFetch('https://www.shop.example.vn/a', net, options);
    expect(await reasonOf(safeFetch('https://notshop.example.vn/a', net, options))).toBe(
      'DOMAIN_NOT_ALLOWED',
    );
    expect(await reasonOf(safeFetch('https://shop.example.vn/out', net, options))).toBe(
      'DOMAIN_NOT_ALLOWED',
    );
    expect(
      await reasonOf(
        safeFetch('https://shop.example.vn/a', net, { ...OPTIONS, allowedDomains: [] }),
      ),
    ).toBe('DOMAIN_NOT_ALLOWED');
    // mục rỗng / TLD trần không khớp rộng; dấu chấm cuối và khoảng trắng được chuẩn hóa
    for (const bad of ['', ' ', 'vn', '.']) {
      const denied = safeFetch('https://shop.example.vn/a', net, {
        ...OPTIONS,
        allowedDomains: [bad],
      });
      expect(await reasonOf(denied)).toBe('DOMAIN_NOT_ALLOWED');
    }
    const ok = await safeFetch('https://shop.example.vn/a', net, {
      ...OPTIONS,
      allowedDomains: [' Shop.Example.vn. '],
    });
    expect(ok.status).toBe(200);
  });

  it('chỉ nhận text/html, xhtml, text/plain; từ chối loại khác hoặc thiếu Content-Type', async () => {
    const make = (headers: Record<string, string>) =>
      createFakeNetwork(
        { 'https://shop.example.vn/a': { status: 200, headers, body: 'x' } },
        { 'shop.example.vn': PUBLIC },
      );
    expect(
      await reasonOf(
        safeFetch(
          'https://shop.example.vn/a',
          make({ 'content-type': 'application/pdf' }),
          OPTIONS,
        ),
      ),
    ).toBe('UNSUPPORTED_CONTENT');
    expect(await reasonOf(safeFetch('https://shop.example.vn/a', make({}), OPTIONS))).toBe(
      'UNSUPPORTED_CONTENT',
    );
    expect(
      (
        await safeFetch(
          'https://shop.example.vn/a',
          make({ 'content-type': 'APPLICATION/XHTML+XML' }),
          OPTIONS,
        )
      ).contentType,
    ).toBe('application/xhtml+xml');
    expect(
      (
        await safeFetch('https://shop.example.vn/a', make({ 'content-type': 'text/plain' }), {
          ...OPTIONS,
          acceptContentTypes: ['text/plain'],
        })
      ).status,
    ).toBe(200);
    expect(
      await reasonOf(
        safeFetch('https://shop.example.vn/a', make({ 'content-type': 'text/html' }), {
          ...OPTIONS,
          acceptContentTypes: ['text/plain'],
        }),
      ),
    ).toBe('UNSUPPORTED_CONTENT');
  });

  it('trang giả thiếu trạng thái/header: mặc định 200, không Content-Type → bị từ chối', async () => {
    const net = createFakeNetwork(
      { 'https://shop.example.vn/a': { body: 'x' } },
      { 'shop.example.vn': PUBLIC },
    );
    expect(await reasonOf(safeFetch('https://shop.example.vn/a', net, OPTIONS))).toBe(
      'UNSUPPORTED_CONTENT',
    );
    const bare = createFakeNetwork(
      { 'https://shop.example.vn/a': {} },
      { 'shop.example.vn': PUBLIC },
    );
    expect(await reasonOf(safeFetch('https://shop.example.vn/a', bare, OPTIONS))).toBe(
      'UNSUPPORTED_CONTENT',
    );
  });

  it('từ chối nội dung nén (không giải nén → tránh bom giải nén)', async () => {
    const net = createFakeNetwork(
      {
        'https://shop.example.vn/a': htmlPage('x', {
          headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' },
        }),
      },
      { 'shop.example.vn': PUBLIC },
    );
    expect(await reasonOf(safeFetch('https://shop.example.vn/a', net, OPTIONS))).toBe(
      'UNSUPPORTED_CONTENT',
    );
    const identity = createFakeNetwork(
      {
        'https://shop.example.vn/a': htmlPage('x', {
          headers: { 'content-type': 'text/html', 'content-encoding': 'identity' },
        }),
      },
      { 'shop.example.vn': PUBLIC },
    );
    expect((await safeFetch('https://shop.example.vn/a', identity, OPTIONS)).status).toBe(200);
  });

  it('trạng thái lỗi trả về nguyên (người gọi quyết định); không kiểm Content-Type với trạng thái không phải 2xx', async () => {
    const net = createFakeNetwork(
      { 'https://shop.example.vn/a': { status: 503, headers: {}, body: '' } },
      { 'shop.example.vn': PUBLIC },
    );
    expect((await safeFetch('https://shop.example.vn/a', net, OPTIONS)).status).toBe(503);
  });

  it('beforeRequest chạy ở từng chặng sau kiểm SSRF; ném lỗi thì không gửi yêu cầu chặng đó', async () => {
    const net = createFakeNetwork(
      {
        'https://shop.example.vn/a': redirectTo('https://www.example.vn/b'),
        'https://www.example.vn/b': htmlPage('ok'),
      },
      { 'shop.example.vn': PUBLIC, 'www.example.vn': PUBLIC },
    );
    const hops: string[] = [];
    await safeFetch('https://shop.example.vn/a', net, {
      ...OPTIONS,
      beforeRequest: async (url) => void hops.push(url.href),
    });
    expect(hops).toEqual(['https://shop.example.vn/a', 'https://www.example.vn/b']);

    const blocked = createFakeNetwork(
      { 'https://shop.example.vn/a': htmlPage('ok') },
      { 'shop.example.vn': PUBLIC },
    );
    const denied = safeFetch('https://shop.example.vn/a', blocked, {
      ...OPTIONS,
      beforeRequest: async () => {
        throw new UrlCrawlError('ROBOTS_DISALLOWED');
      },
    });
    expect(await reasonOf(denied)).toBe('ROBOTS_DISALLOWED');
    expect(blocked.requests).toHaveLength(0);

    // URL nội bộ bị chặn TRƯỚC khi hook chạy
    const internal: string[] = [];
    await reasonOf(
      safeFetch('http://127.0.0.1/', createFakeNetwork({}), {
        ...OPTIONS,
        beforeRequest: async (url) => void internal.push(url.href),
      }),
    );
    expect(internal).toEqual([]);
  });

  it('chuyển nguyên truncated và giới hạn tùy chỉnh; lỗi transport lan ra như UrlCrawlError', async () => {
    const net = createFakeNetwork(
      { 'https://shop.example.vn/a': htmlPage('abc', { truncated: true }) },
      { 'shop.example.vn': PUBLIC },
    );
    const result = await safeFetch('https://shop.example.vn/a', net, {
      ...OPTIONS,
      maxBytes: 10,
      timeoutMs: 500,
    });
    expect(result.truncated).toBe(true);
    expect(net.requests[0]!.maxBytes).toBe(10);
    expect(net.requests[0]!.timeoutMs).toBe(500);

    const failing = createFakeNetwork(
      { 'https://shop.example.vn/a': { error: new UrlCrawlError('TIMEOUT') } },
      { 'shop.example.vn': PUBLIC },
    );
    expect(await reasonOf(safeFetch('https://shop.example.vn/a', failing, OPTIONS))).toBe(
      'TIMEOUT',
    );
  });
});
