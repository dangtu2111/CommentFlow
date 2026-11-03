import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRateLimiter, createValkeyRateLimiter, createValkeyStore } from '../src/ratelimit';

const SECRET = 'khoa-thu-nghiem-valkey-khong-dung-that';
const PREFIX = `test-${randomUUID().slice(0, 8)}:`;

function requireRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('Thiếu biến môi trường REDIS_URL (Valkey thật)');
  return url;
}

let raw: Redis; // client KHÔNG có keyPrefix: để soi khóa thật trong Valkey
let closeLimiter: () => Promise<void>;
let limiter: ReturnType<typeof createValkeyRateLimiter>['limiter'];
const warnings: unknown[] = [];

const newEmail = () => `${randomUUID()}@example.test`;

beforeAll(() => {
  raw = new Redis(requireRedisUrl());
  const made = createValkeyRateLimiter({
    url: requireRedisUrl(),
    keyPrefix: PREFIX,
    secret: SECRET,
    onWarn: (w) => warnings.push(w),
  });
  limiter = made.limiter;
  closeLimiter = made.close;
});

afterAll(async () => {
  const keys = await raw.keys(`${PREFIX}*`);
  if (keys.length > 0) await raw.del(...keys);
  await closeLimiter();
  raw.disconnect();
});

describe('bộ giới hạn trên Valkey thật', () => {
  it('đăng nhập: 5 lần đầu được phép, lần thứ 6 bị chặn; xô theo email 10 lần bất kể IP', async () => {
    const email = newEmail();
    for (let i = 0; i < 5; i++) {
      expect((await limiter.check('login', { email, ip: '203.0.113.7' })).allowed).toBe(true);
    }
    expect((await limiter.check('login', { email, ip: '203.0.113.7' })).allowed).toBe(false);

    const other = newEmail();
    const results = [];
    for (let i = 1; i <= 11; i++)
      results.push(await limiter.check('login', { email: other, ip: `198.51.100.${i}` }));
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(results[10]?.allowed).toBe(false);
  });

  it('khóa trong Valkey: tiền tố môi trường + sys:rl:, có TTL đúng cửa sổ, KHÔNG chứa email/IP thô', async () => {
    const email = newEmail();
    await limiter.check('forgot', { email });
    const keys = await raw.keys(`${PREFIX}sys:rl:forgot:*`);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    for (const key of keys) {
      expect(key).not.toContain('example');
      expect(key).not.toContain(email.slice(0, 8));
      const ttl = await raw.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    }
    const loginKeys = await raw.keys(`${PREFIX}sys:rl:login:*`);
    await limiter.check('login', { email, ip: '203.0.113.99' });
    const after = await raw.keys(`${PREFIX}sys:rl:login:*`);
    expect(after.length).toBeGreaterThan(loginKeys.length);
    expect(after.join(' ')).not.toContain('203.0.113');
  });

  it('nguyên tử: 40 lần đếm đồng thời cho một khóa ra đúng số 1..40, không mất lần nào', async () => {
    const store = createValkeyStore(raw);
    const key = `${PREFIX}sys:rl:dong-thoi:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 40 }, () => store.hit(key, 60)));
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    expect(await raw.ttl(key)).toBeGreaterThan(0);
  });

  it('lần bị chặn không kéo dài cửa sổ: TTL chỉ giảm', async () => {
    const email = newEmail();
    for (let i = 0; i < 4; i++) await limiter.check('forgot', { email }); // vượt ngưỡng 3
    const [key] = await raw.keys(`${PREFIX}sys:rl:forgot:email:*`).then((ks) => ks.slice(-1));
    const first = await raw.ttl(key as string);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await limiter.check('forgot', { email });
    expect(await raw.ttl(key as string)).toBeLessThanOrEqual(first);
  });

  it('reset xóa bộ đếm trong Valkey', async () => {
    const email = newEmail();
    const id = { email, ip: '203.0.113.50' };
    for (let i = 0; i < 4; i++) await limiter.check('login', id);
    await limiter.reset('login', id);
    for (let i = 0; i < 5; i++) expect((await limiter.check('login', id)).allowed).toBe(true);
  });
});

describe('Valkey không kết nối được (cổng đóng)', () => {
  it('đăng nhập dùng bộ đếm dự phòng trong bộ nhớ (vẫn giới hạn); quên mật khẩu/đăng ký/gửi lại bị từ chối; có cảnh báo không PII', async () => {
    const downWarnings: unknown[] = [];
    const down = createValkeyRateLimiter({
      url: 'redis://127.0.0.1:1/0',
      secret: SECRET,
      onWarn: (w) => downWarnings.push(w),
    });
    try {
      const email = newEmail();
      for (let i = 0; i < 10; i++)
        expect((await down.limiter.check('login', { email })).allowed).toBe(true);
      expect((await down.limiter.check('login', { email })).allowed).toBe(false);
      for (const action of ['forgot', 'register', 'resend'] as const) {
        expect(await down.limiter.check(action, { email: newEmail() })).toMatchObject({
          allowed: false,
          reason: 'unavailable',
        });
      }
      expect(downWarnings.length).toBeGreaterThan(0);
      expect(JSON.stringify(downWarnings)).not.toMatch(/@|127\.0\.0\.1|sys:rl/);
    } finally {
      await down.close();
    }
  }, 60_000);
});

describe('hợp nhất với createRateLimiter tự dựng', () => {
  it('createValkeyStore dùng được với bộ giới hạn thông thường', async () => {
    const custom = createRateLimiter({ store: createValkeyStore(raw), secret: SECRET });
    const email = newEmail();
    for (let i = 0; i < 3; i++)
      expect((await custom.check('resend', { email })).allowed).toBe(true);
    expect((await custom.check('resend', { email })).allowed).toBe(false);
    // dọn khóa không có tiền tố test
    const keys = await raw.keys('sys:rl:resend:*');
    if (keys.length > 0) await raw.del(...keys);
  });
});
