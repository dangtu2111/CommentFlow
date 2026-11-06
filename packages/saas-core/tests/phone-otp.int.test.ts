import { randomBytes } from 'node:crypto';
import type { AuthDb } from '@flow/db/auth-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAuthProfileStore,
  createPhoneVerifyFlows,
  OTP_MAX_ATTEMPTS,
  type PhoneVerifyFlows,
} from '../src/auth';
import { wrapAuthDb } from '../src/auth/auth-db';
import { createMemoryStore, createRateLimiter } from '../src/ratelimit';
import { adminQuery, createTestAuthDb, createTestUser } from './helpers';

/** Xác minh SĐT bằng OTP trên DB thật (role cf_auth): băm trong bảng, ghi SĐT sau khi đúng, mã chết sau 5 lần sai. */
const SECRET = randomBytes(32).toString('hex');
let authDb: AuthDb;
let store: ReturnType<typeof createAuthProfileStore>;
const sent: string[] = [];
let flows: PhoneVerifyFlows;

beforeAll(() => {
  authDb = createTestAuthDb(3);
  store = createAuthProfileStore(wrapAuthDb(authDb));
  flows = createPhoneVerifyFlows({
    store: store.challenges,
    sms: {
      async send(message) {
        sent.push(message.text);
      },
    },
    limiter: createRateLimiter({ store: createMemoryStore(), secret: SECRET }),
    secret: SECRET,
    enabled: true,
  });
});
afterAll(async () => {
  await authDb.close();
});

const lastCode = () => /(\d{6})/.exec(sent.at(-1) ?? '')?.[1] ?? '';

describe('xác minh SĐT bằng OTP (DB thật)', () => {
  it('gửi → bảng chỉ có BĂM → nhập đúng → users.phone + phone_verified_at, thử thách bị xóa', async () => {
    const userId = await createTestUser('Người xác minh SĐT');
    const started = await flows.start({ userId, phoneInput: '0912 345 678' });
    expect(started.status).toBe('sent');
    const code = lastCode();
    const [row] = await adminQuery<{ code_hash: string; phone: string }>(
      'SELECT code_hash, phone FROM core.phone_verifications WHERE user_id = $1',
      [userId],
    );
    expect(row?.phone).toBe('+84912345678');
    expect(row?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.code_hash).not.toContain(code);

    expect((await flows.verify({ userId, code })).status).toBe('verified');
    const [user] = await adminQuery<{ phone: string; phone_verified_at: Date | null }>(
      'SELECT phone, phone_verified_at FROM core.users WHERE id = $1',
      [userId],
    );
    expect(user?.phone).toBe('+84912345678');
    expect(user?.phone_verified_at).not.toBeNull();
    expect(
      await adminQuery('SELECT 1 FROM core.phone_verifications WHERE user_id = $1', [userId]),
    ).toHaveLength(0);
    const profile = await store.readProfile(userId);
    expect(profile).toMatchObject({ phone: '+84912345678', theme: 'system' });
  });

  it(`sai ${OTP_MAX_ATTEMPTS} lần → mã chết, nhập đúng sau đó vẫn không được, SĐT không được ghi`, async () => {
    const userId = await createTestUser('Người nhập sai');
    await flows.start({ userId, phoneInput: '0987654321' });
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await flows.verify({ userId, code: wrong })).toEqual({ status: 'invalid' });
    }
    expect(await flows.verify({ userId, code })).toEqual({ status: 'invalid' });
    const [user] = await adminQuery<{ phone: string | null }>(
      'SELECT phone FROM core.users WHERE id = $1',
      [userId],
    );
    expect(user?.phone).toBeNull();
  });

  it('hết hạn (ghi lùi expires_at) → invalid dù mã đúng', async () => {
    const userId = await createTestUser('Người trễ hạn');
    await flows.start({ userId, phoneInput: '0933333333' });
    const code = lastCode();
    await adminQuery(
      "UPDATE core.phone_verifications SET expires_at = now() - interval '1 hour' WHERE user_id = $1",
      [userId],
    );
    expect(await flows.verify({ userId, code })).toEqual({ status: 'invalid' });
  });

  it('mã của người này không xác minh được SĐT của người khác', async () => {
    const a = await createTestUser('A');
    const b = await createTestUser('B');
    await flows.start({ userId: a, phoneInput: '0944444444' });
    const code = lastCode();
    expect(await flows.verify({ userId: b, code })).toEqual({ status: 'invalid' });
  });
});
