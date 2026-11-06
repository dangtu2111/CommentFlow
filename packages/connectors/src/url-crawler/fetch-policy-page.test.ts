import { describe, expect, it } from 'vitest';
import { UrlCrawlError } from './errors';
import { fetchPolicyPage } from './fetch-policy-page';
import { createFakeNetwork, type FakePage, htmlPage, redirectTo } from './fixtures';
import { createHostThrottle } from './throttle';

const PUBLIC = ['93.184.216.34'];
const OPTIONS = {
  userAgent: 'CommentFlowBot/1.0 (+https://example.vn/bot)',
  allowedDomains: ['shop.example.vn'],
};
const POLICY_HTML = `<html><head><title>Đổi trả</title></head><body><nav>Menu</nav>
  <main><h1>Chính sách đổi trả</h1><p>Khách được đổi hàng trong vòng 7 ngày kể từ khi nhận, sản phẩm còn nguyên tem mác.</p></main></body></html>`;

function robots(body: string, status = 200): FakePage {
  return { status, headers: { 'content-type': 'text/plain' }, body };
}

function setup(pages: Record<string, FakePage>) {
  const net = createFakeNetwork(pages, { 'shop.example.vn': PUBLIC, 'cdn.example.vn': PUBLIC });
  const sleeps: number[] = [];
  let clock = 0;
  const throttle = createHostThrottle({
    minIntervalMs: 2000,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
      sleeps.push(ms);
    },
  });
  return {
    net,
    sleeps,
    deps: {
      transport: net.transport,
      resolver: net.resolver,
      throttle,
      now: () => new Date('2026-11-06T00:00:00Z'),
    },
  };
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof UrlCrawlError ? error.reason : `khac:${String(error)}`;
  }
  return 'khong-loi';
}

describe('FR-053 fetchPolicyPage — nhập chính sách từ link website', () => {
  it('lấy robots.txt rồi trang, trả văn bản sạch + băm nội dung + luôn cần duyệt (FR-164)', async () => {
    const { net, deps } = setup({
      'https://shop.example.vn/robots.txt': robots('User-agent: *\nDisallow: /admin\n'),
      'https://shop.example.vn/doi-tra': htmlPage(POLICY_HTML),
    });
    const page = await fetchPolicyPage('https://shop.example.vn/doi-tra#top', deps, OPTIONS);
    expect(page.title).toBe('Đổi trả');
    expect(page.text).toBe(
      'Chính sách đổi trả\nKhách được đổi hàng trong vòng 7 ngày kể từ khi nhận, sản phẩm còn nguyên tem mác.',
    );
    expect(page.url).toBe('https://shop.example.vn/doi-tra');
    expect(page.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(page.requiresReview).toBe(true);
    expect(page.truncated).toBe(false);
    expect(page.fetchedAt.toISOString()).toBe('2026-11-06T00:00:00.000Z');
    expect(net.requests.map((r) => r.url.href)).toEqual([
      'https://shop.example.vn/robots.txt',
      'https://shop.example.vn/doi-tra',
    ]);
  });

  it('contentHash ổn định khi chỉ đổi khoảng trắng/định dạng, đổi khi đổi chữ', async () => {
    const fetchWith = async (html: string) => {
      const { deps } = setup({ 'https://shop.example.vn/p': htmlPage(html) });
      return (await fetchPolicyPage('https://shop.example.vn/p', deps, OPTIONS)).contentHash;
    };
    const a = await fetchWith('<p>Đổi   trả 7 ngày</p>');
    expect(await fetchWith('<div>\n  <p>Đổi trả\t7 ngày</p>\n</div><script>x=1</script>')).toBe(a);
    expect(await fetchWith('<p>Đổi trả 14 ngày</p>')).not.toBe(a);
  });

  it('robots.txt cấm đường dẫn → ROBOTS_DISALLOWED, không tải trang', async () => {
    const { net, deps } = setup({
      'https://shop.example.vn/robots.txt': robots(
        'User-agent: commentflowbot\nDisallow: /chinh-sach\n',
      ),
      'https://shop.example.vn/chinh-sach/doi-tra': htmlPage(POLICY_HTML),
    });
    expect(
      await reasonOf(fetchPolicyPage('https://shop.example.vn/chinh-sach/doi-tra', deps, OPTIONS)),
    ).toBe('ROBOTS_DISALLOWED');
    expect(net.requests.map((r) => r.url.pathname)).toEqual(['/robots.txt']);
  });

  it('robots.txt 404/403 → cho phép; 5xx → từ chối; loại nội dung lạ/chuyển hướng vô hạn → từ chối', async () => {
    for (const status of [404, 403]) {
      const { deps } = setup({
        'https://shop.example.vn/robots.txt': robots('', status),
        'https://shop.example.vn/p': htmlPage(POLICY_HTML),
      });
      expect((await fetchPolicyPage('https://shop.example.vn/p', deps, OPTIONS)).text).toContain(
        'đổi hàng',
      );
    }
    const down = setup({
      'https://shop.example.vn/robots.txt': robots('', 503),
      'https://shop.example.vn/p': htmlPage(POLICY_HTML),
    });
    expect(await reasonOf(fetchPolicyPage('https://shop.example.vn/p', down.deps, OPTIONS))).toBe(
      'ROBOTS_DISALLOWED',
    );
    const weird = setup({
      'https://shop.example.vn/robots.txt': {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
        body: 'x',
      },
      'https://shop.example.vn/p': htmlPage(POLICY_HTML),
    });
    expect(await reasonOf(fetchPolicyPage('https://shop.example.vn/p', weird.deps, OPTIONS))).toBe(
      'ROBOTS_DISALLOWED',
    );
  });

  it('robots.txt lỗi mạng/timeout → lan lỗi gốc, không đoán là được phép', async () => {
    const { deps } = setup({
      'https://shop.example.vn/robots.txt': { error: new UrlCrawlError('TIMEOUT') },
    });
    expect(await reasonOf(fetchPolicyPage('https://shop.example.vn/p', deps, OPTIONS))).toBe(
      'TIMEOUT',
    );
  });

  it('robots.txt chuyển hướng tới IP nội bộ → lỗi bảo mật lan ra (không nuốt)', async () => {
    const { deps } = setup({
      'https://shop.example.vn/robots.txt': redirectTo('http://169.254.169.254/'),
    });
    expect(await reasonOf(fetchPolicyPage('https://shop.example.vn/p', deps, OPTIONS))).toBe(
      'HOST_BLOCKED',
    );
  });

  it('chờ giới hạn tốc độ giữa robots.txt và trang; tôn trọng Crawl-delay (có trần)', async () => {
    const { deps, sleeps } = setup({
      'https://shop.example.vn/robots.txt': robots('User-agent: *\nCrawl-delay: 5\n'),
      'https://shop.example.vn/p': htmlPage(POLICY_HTML),
    });
    await fetchPolicyPage('https://shop.example.vn/p', deps, OPTIONS);
    // robots.txt là lần gọi đầu (không chờ); trang đến sau, phải cách đủ Crawl-delay 5 giây của website.
    expect(sleeps).toEqual([5000]);
  });

  it('kiểm robots theo từng host khi bị chuyển hướng; host mới không nằm trong miền cho phép thì dừng', async () => {
    const { net, deps } = setup({
      'https://shop.example.vn/robots.txt': robots(''),
      'https://shop.example.vn/p': redirectTo('https://cdn.example.vn/p'),
      'https://cdn.example.vn/robots.txt': robots('User-agent: *\nDisallow: /p\n'),
      'https://cdn.example.vn/p': htmlPage(POLICY_HTML),
    });
    const allowBoth = { ...OPTIONS, allowedDomains: ['shop.example.vn', 'cdn.example.vn'] };
    expect(await reasonOf(fetchPolicyPage('https://shop.example.vn/p', deps, allowBoth))).toBe(
      'ROBOTS_DISALLOWED',
    );
    expect(
      await reasonOf(
        fetchPolicyPage(
          'https://shop.example.vn/p',
          setup({
            'https://shop.example.vn/robots.txt': robots(''),
            'https://shop.example.vn/p': redirectTo('https://cdn.example.vn/p'),
          }).deps,
          OPTIONS,
        ),
      ),
    ).toBe('DOMAIN_NOT_ALLOWED');
    expect(net.requests.map((r) => r.url.href)).toContain('https://cdn.example.vn/robots.txt');
  });

  it('lỗi HTTP của trang → BAD_STATUS; nội dung rỗng → EMPTY_CONTENT', async () => {
    const notFound = setup({
      'https://shop.example.vn/p': {
        status: 404,
        headers: { 'content-type': 'text/html' },
        body: 'x',
      },
    });
    expect(
      await reasonOf(fetchPolicyPage('https://shop.example.vn/p', notFound.deps, OPTIONS)),
    ).toBe('BAD_STATUS');
    const empty = setup({
      'https://shop.example.vn/p': htmlPage(
        '<html><body><script>x</script><nav>menu</nav></body></html>',
      ),
    });
    expect(await reasonOf(fetchPolicyPage('https://shop.example.vn/p', empty.deps, OPTIONS))).toBe(
      'EMPTY_CONTENT',
    );
  });

  it('text/plain được dùng trực tiếp; cờ truncated khi tải bị cắt hoặc văn bản quá dài', async () => {
    const plain = setup({
      'https://shop.example.vn/p': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: '  Đổi trả 7 ngày  \n\n\nBảo hành 12 tháng ',
      },
    });
    const page = await fetchPolicyPage('https://shop.example.vn/p', plain.deps, OPTIONS);
    expect(page.text).toBe('Đổi trả 7 ngày\nBảo hành 12 tháng');
    expect(page.title).toBeUndefined();

    const cut = setup({
      'https://shop.example.vn/p': htmlPage('<p>Đổi trả 7 ngày</p>', { truncated: true }),
    });
    expect((await fetchPolicyPage('https://shop.example.vn/p', cut.deps, OPTIONS)).truncated).toBe(
      true,
    );
    const longPlain = setup({
      'https://shop.example.vn/p': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'chữ '.repeat(100),
      },
    });
    const clipped = await fetchPolicyPage('https://shop.example.vn/p', longPlain.deps, {
      ...OPTIONS,
      maxTextChars: 40,
    });
    expect(clipped.truncated).toBe(true);
    expect(clipped.text.length).toBeLessThanOrEqual(40);
    const long = setup({ 'https://shop.example.vn/p': htmlPage(`<p>${'chữ '.repeat(100)}</p>`) });
    expect(
      (
        await fetchPolicyPage('https://shop.example.vn/p', long.deps, {
          ...OPTIONS,
          maxTextChars: 40,
        })
      ).truncated,
    ).toBe(true);
  });

  it('SSRF: URL nội bộ/DNS trỏ nội bộ bị chặn trước mọi yêu cầu; throttle mặc định khi không tiêm', async () => {
    const net = createFakeNetwork({}, { 'shop.example.vn': ['192.168.1.9'] });
    const deps = { transport: net.transport, resolver: net.resolver };
    expect(await reasonOf(fetchPolicyPage('http://localhost/admin', deps, {}))).toBe(
      'HOST_BLOCKED',
    );
    expect(await reasonOf(fetchPolicyPage('https://shop.example.vn/p', deps, OPTIONS))).toBe(
      'HOST_BLOCKED',
    );
    expect(net.requests).toHaveLength(0);
  });

  it('dùng User-Agent mặc định, throttle và đồng hồ mặc định khi không cấu hình', async () => {
    const net = createFakeNetwork(
      { 'https://shop.example.vn/p': htmlPage('<p>Đổi trả 7 ngày</p>') },
      { 'shop.example.vn': PUBLIC },
    );
    const page = await fetchPolicyPage(
      'https://shop.example.vn/p',
      { transport: net.transport, resolver: net.resolver },
      {},
    );
    expect(page.text).toBe('Đổi trả 7 ngày');
    expect(net.requests[0]!.headers['user-agent']).toMatch(/^CommentFlowBot\//);
    expect(page.fetchedAt).toBeInstanceOf(Date);
  });
});
