import { describe, expect, it, vi } from 'vitest';
import { bucketKey, normalizeEmail, normalizeIp } from './keys';
import { createRateLimiter, type RateWarning } from './limiter';
import { createMemoryStore, type RateStore } from './store';

const SECRET = 'khoa-thu-nghiem-khong-dung-that';

describe('normalizeIp', () => {
  it('IPv4 giữ nguyên; bỏ khoảng trắng và chữ hoa', () => {
    expect(normalizeIp(' 203.0.113.7 ')).toBe('203.0.113.7');
  });

  it('::ffff:a.b.c.d (cả dạng hex) quy về IPv4', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('::FFFF:cb00:7107')).toBe('203.0.113.7');
    expect(normalizeIp('[::ffff:127.0.0.1]')).toBe('127.0.0.1');
  });

  it('IPv6 cùng /64 → cùng khóa; /64 khác → khác khóa; hoa/thường và dạng rút gọn không khác nhau', () => {
    const a = normalizeIp('2001:db8:abcd:12::1');
    expect(a).toBe('v6:2001:0db8:abcd:0012');
    expect(normalizeIp('2001:DB8:ABCD:12:ffff:ffff:ffff:ffff')).toBe(a);
    expect(normalizeIp('2001:db8:abcd:0012:0:0:0:2')).toBe(a);
    expect(normalizeIp('2001:db8:abcd:13::1')).not.toBe(a);
  });

  it('bỏ zone id; chuỗi không phải IP → undefined', () => {
    expect(normalizeIp('fe80::1%eth0')).toBe('v6:fe80:0000:0000:0000');
    for (const bad of ['', undefined, null, 'abc', '999.1.1.1', '1.2.3', '<script>', '::1::2']) {
      expect(normalizeIp(bad as string | undefined), String(bad)).toBeUndefined();
    }
  });
});

describe('bucketKey', () => {
  const key = (identity: string, secret = SECRET) =>
    bucketKey({ action: 'login', bucket: 'email', identity, secret });

  it('có tiền tố sys:rl:, KHÔNG chứa email/IP thô', () => {
    const email = 'nguoi.dung@example.test';
    const k = key(email);
    expect(k.startsWith('sys:rl:login:email:')).toBe(true);
    expect(k).not.toContain('nguoi');
    expect(k).not.toContain('example');
    expect(
      bucketKey({ action: 'login', bucket: 'ip', identity: '203.0.113.7', secret: SECRET }),
    ).not.toContain('203');
  });

  it('cùng danh tính + khóa → cùng khóa; khác khóa bí mật → khác (không dò ngược bằng bảng băm)', () => {
    expect(key('a@example.test')).toBe(key('a@example.test'));
    expect(key('a@example.test')).not.toBe(key('b@example.test'));
    expect(key('a@example.test')).not.toBe(key('a@example.test', 'khoa-khac'));
  });

  it('khác hành động hoặc xô → khác khóa dù cùng danh tính', () => {
    const base = { identity: 'a@example.test', secret: SECRET };
    expect(bucketKey({ action: 'login', bucket: 'email', ...base })).not.toBe(
      bucketKey({ action: 'forgot', bucket: 'email', ...base }),
    );
    expect(bucketKey({ action: 'login', bucket: 'email', ...base })).not.toBe(
      bucketKey({ action: 'login', bucket: 'ip-email', ...base }),
    );
  });
});

describe('normalizeEmail', () => {
  it('hạ chữ thường và bỏ khoảng trắng', () => {
    expect(normalizeEmail('  Linh@Example.TEST ')).toBe('linh@example.test');
  });
});

describe('createMemoryStore', () => {
  it('đếm trong cửa sổ, hết cửa sổ thì đếm lại từ 1; lần đếm sau KHÔNG kéo dài cửa sổ', async () => {
    let now = 1_000_000;
    const store = createMemoryStore(() => now);
    expect((await store.hit('k', 60)).count).toBe(1);
    now += 30_000;
    const second = await store.hit('k', 60);
    expect(second).toEqual({ count: 2, ttlSeconds: 30 });
    now += 31_000; // quá 60 giây kể từ lần ĐẦU
    expect((await store.hit('k', 60)).count).toBe(1);
  });

  it('reset xóa bộ đếm', async () => {
    const store = createMemoryStore();
    await store.hit('k', 60);
    await store.reset(['k']);
    expect((await store.hit('k', 60)).count).toBe(1);
  });
});

function limiterWith(
  options: { store?: RateStore; fallback?: RateStore; now?: () => number } = {},
) {
  const warnings: RateWarning[] = [];
  const limiter = createRateLimiter({
    store: options.store ?? createMemoryStore(options.now),
    ...(options.fallback ? { fallback: options.fallback } : {}),
    secret: SECRET,
    onWarn: (w) => warnings.push(w),
  });
  return { limiter, warnings };
}

describe('đăng nhập: xô IP+email 5/15 phút', () => {
  it('5 lần đầu được phép, lần thứ 6 bị chặn kèm số giây chờ (≤ 900)', async () => {
    const { limiter } = limiterWith();
    const id = { email: 'a@example.test', ip: '203.0.113.7' };
    for (let i = 0; i < 5; i++) expect((await limiter.check('login', id)).allowed).toBe(true);
    const sixth = await limiter.check('login', id);
    expect(sixth).toMatchObject({ allowed: false, reason: 'limited' });
    if (!sixth.allowed) {
      expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
      expect(sixth.retryAfterSeconds).toBeLessThanOrEqual(900);
    }
  });

  it('khóa chỉ TẠM: sau 15 phút được thử lại; lần bị chặn không kéo dài thời gian khóa', async () => {
    let now = 0;
    const { limiter } = limiterWith({ now: () => now });
    const id = { email: 'a@example.test', ip: '203.0.113.7' };
    for (let i = 0; i < 6; i++) await limiter.check('login', id);
    now += 600_000;
    const during = await limiter.check('login', id);
    expect(during.allowed).toBe(false);
    if (!during.allowed) expect(during.retryAfterSeconds).toBeLessThanOrEqual(300); // không bị đặt lại về 900
    now += 301_000;
    expect((await limiter.check('login', id)).allowed).toBe(true);
  });

  it('đăng nhập thành công (reset) xóa bộ đếm của danh tính đó', async () => {
    const { limiter } = limiterWith();
    const id = { email: 'a@example.test', ip: '203.0.113.7' };
    for (let i = 0; i < 4; i++) await limiter.check('login', id);
    await limiter.reset('login', id);
    for (let i = 0; i < 5; i++) expect((await limiter.check('login', id)).allowed).toBe(true);
  });
});

describe('đăng nhập: xô riêng theo email (đổi IP không vượt được)', () => {
  it('11 lần từ 11 IP khác nhau cho cùng một email: lần thứ 11 bị chặn bởi xô email (ngưỡng 10)', async () => {
    const { limiter } = limiterWith();
    const results = [];
    for (let i = 1; i <= 11; i++) {
      results.push(
        await limiter.check('login', { email: 'nan.nhan@example.test', ip: `198.51.100.${i}` }),
      );
    }
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(results[10]?.allowed).toBe(false);
  });

  it('không có IP (dev): chỉ còn xô email — ngưỡng 10, KHÔNG có khóa chung "unknown" giữa các email khác nhau', async () => {
    const { limiter } = limiterWith();
    for (let i = 0; i < 10; i++) {
      expect((await limiter.check('login', { email: 'a@example.test' })).allowed).toBe(true);
    }
    expect((await limiter.check('login', { email: 'a@example.test' })).allowed).toBe(false);
    // người dùng khác không bị ảnh hưởng
    expect((await limiter.check('login', { email: 'b@example.test' })).allowed).toBe(true);
  });

  it('email viết hoa/thường/khoảng trắng khác nhau cùng một xô (không né bằng cách đổi chữ hoa)', async () => {
    const { limiter } = limiterWith();
    const variants = ['A@Example.test', ' a@example.test', 'a@EXAMPLE.TEST'];
    for (let i = 0; i < 10; i++) await limiter.check('login', { email: variants[i % 3] as string });
    expect((await limiter.check('login', { email: 'a@example.test' })).allowed).toBe(false);
  });

  it('phản hồi khi bị chặn giống hệt nhau cho email có thật và email lạ (cùng hình dạng)', async () => {
    const { limiter } = limiterWith();
    const blocked = async (email: string) => {
      let last = await limiter.check('login', { email });
      for (let i = 0; i < 10; i++) last = await limiter.check('login', { email });
      return last;
    };
    const [a, b] = [await blocked('co-that@example.test'), await blocked('khong-co@example.test')];
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a).toEqual(b);
  });
});

describe('đăng ký, quên mật khẩu, gửi lại thư', () => {
  it('quên mật khẩu 3 lần/giờ/email; lần thứ 4 bị chặn', async () => {
    const { limiter } = limiterWith();
    for (let i = 0; i < 3; i++)
      expect((await limiter.check('forgot', { email: 'a@example.test' })).allowed).toBe(true);
    expect((await limiter.check('forgot', { email: 'a@example.test' })).allowed).toBe(false);
  });

  it('gửi lại thư 3 lần/giờ/email', async () => {
    const { limiter } = limiterWith();
    for (let i = 0; i < 3; i++) await limiter.check('resend', { email: 'a@example.test' });
    expect((await limiter.check('resend', { email: 'a@example.test' })).allowed).toBe(false);
    expect((await limiter.check('resend', { email: 'b@example.test' })).allowed).toBe(true);
  });

  it('đăng ký: 5 lần/giờ/IP (nhiều email khác nhau) và 3 lần/giờ/email', async () => {
    const { limiter } = limiterWith();
    for (let i = 0; i < 5; i++) {
      expect(
        (await limiter.check('register', { email: `u${i}@example.test`, ip: '203.0.113.9' }))
          .allowed,
      ).toBe(true);
    }
    expect(
      (await limiter.check('register', { email: 'u9@example.test', ip: '203.0.113.9' })).allowed,
    ).toBe(false);

    const other = limiterWith().limiter;
    for (let i = 0; i < 3; i++)
      await other.check('register', { email: 'x@example.test', ip: `203.0.113.${i + 20}` });
    expect(
      (await other.check('register', { email: 'x@example.test', ip: '203.0.113.99' })).allowed,
    ).toBe(false);
  });

  it('đăng ký không có IP: chỉ xô email; không gom mọi người vào một khóa chung', async () => {
    const { limiter } = limiterWith();
    for (let i = 0; i < 20; i++) {
      expect((await limiter.check('register', { email: `n${i}@example.test` })).allowed).toBe(true);
    }
  });
});

describe('khi kho (Valkey) không dùng được', () => {
  const broken: RateStore = {
    hit: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:6379 password=hunter2')),
    reset: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
  };

  it('đăng nhập: dùng bộ đếm dự phòng trong bộ nhớ (vẫn giới hạn) + log cảnh báo', async () => {
    const { limiter, warnings } = limiterWith({ store: broken });
    const id = { email: 'a@example.test' };
    for (let i = 0; i < 10; i++) expect((await limiter.check('login', id)).allowed).toBe(true);
    expect((await limiter.check('login', id)).allowed).toBe(false);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toEqual({
      event: 'ratelimit_store_unavailable',
      action: 'login',
      mode: 'memory',
    });
  });

  it('đăng ký / quên mật khẩu / gửi lại thư: TỪ CHỐI (không gửi thư) + log cảnh báo', async () => {
    for (const action of ['register', 'forgot', 'resend'] as const) {
      const { limiter, warnings } = limiterWith({ store: broken });
      const decision = await limiter.check(action, { email: 'a@example.test', ip: '203.0.113.7' });
      expect(decision).toMatchObject({ allowed: false, reason: 'unavailable' });
      expect(warnings[0]).toEqual({ event: 'ratelimit_store_unavailable', action, mode: 'deny' });
    }
  });

  it('log cảnh báo KHÔNG chứa email, IP, khóa hay thông điệp lỗi gốc (có thể chứa mật khẩu kết nối)', async () => {
    const { limiter, warnings } = limiterWith({ store: broken });
    await limiter.check('login', { email: 'bi-mat@example.test', ip: '203.0.113.7' });
    const text = JSON.stringify(warnings);
    for (const secretish of [
      'bi-mat',
      'example',
      '203.0.113',
      'sys:rl',
      'hunter2',
      'ECONNREFUSED',
    ]) {
      expect(text).not.toContain(secretish);
    }
  });

  it('reset khi kho lỗi không ném lỗi', async () => {
    const { limiter } = limiterWith({ store: broken });
    await expect(limiter.reset('login', { email: 'a@example.test' })).resolves.toBeUndefined();
  });
});
