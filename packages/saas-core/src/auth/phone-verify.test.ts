import { describe, expect, it } from 'vitest';
import { createMemoryStore, createRateLimiter } from '../ratelimit';
import {
  createPhoneVerifyFlows,
  hashOtp,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  type PhoneChallenge,
  type PhoneChallengeStore,
} from './phone-verify';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SECRET = 'test-secret-test-secret-test-secret';

function memoryChallengeStore() {
  const challenges = new Map<string, PhoneChallenge>();
  const verified = new Map<string, { phone: string; at: Date }>();
  const store: PhoneChallengeStore = {
    async upsert(c) {
      challenges.set(c.userId, { ...c });
    },
    async find(userId) {
      const c = challenges.get(userId);
      return c ? { ...c } : null;
    },
    async addAttempt(userId) {
      const c = challenges.get(userId);
      if (!c) return 0;
      c.attempts += 1;
      return c.attempts;
    },
    async remove(userId) {
      challenges.delete(userId);
    },
    async markVerified(userId, phone, at) {
      verified.set(userId, { phone, at });
      challenges.delete(userId);
    },
  };
  return { store, challenges, verified };
}

function setup(over: { enabled?: boolean; codes?: string[]; failSms?: boolean } = {}) {
  let clock = 1_800_000_000_000;
  const { store, challenges, verified } = memoryChallengeStore();
  const sent: { to: string; text: string }[] = [];
  const codes = [...(over.codes ?? ['123456', '654321', '111111', '222222', '333333', '444444'])];
  const flows = createPhoneVerifyFlows({
    store,
    sms: {
      async send(message) {
        if (over.failSms) throw new Error('sms down');
        sent.push(message);
      },
    },
    limiter: createRateLimiter({ store: createMemoryStore(() => clock), secret: SECRET }),
    secret: SECRET,
    enabled: over.enabled ?? true,
    now: () => clock,
    generateCode: () => codes.shift() ?? '000000',
  });
  return {
    flows,
    sent,
    challenges,
    verified,
    advance: (seconds: number) => {
      clock += seconds * 1000;
    },
  };
}

describe('hashOtp', () => {
  it('không chứa mã thô và phụ thuộc người dùng + SĐT', () => {
    const a = hashOtp(SECRET, USER, '+84912345678', '123456');
    expect(a).not.toContain('123456');
    expect(a).not.toBe(hashOtp(SECRET, OTHER, '+84912345678', '123456'));
    expect(a).not.toBe(hashOtp(SECRET, USER, '+84912345679', '123456'));
    expect(a).not.toBe(hashOtp('khac', USER, '+84912345678', '123456'));
  });
});

describe('start', () => {
  it('cờ TẮT → disabled, không gửi, không lưu', async () => {
    const t = setup({ enabled: false });
    expect(await t.flows.start({ userId: USER, phoneInput: '0912345678' })).toEqual({
      status: 'disabled',
    });
    expect(t.sent).toHaveLength(0);
    expect(t.challenges.size).toBe(0);
  });

  it('SĐT sai định dạng → invalid_phone, không gửi', async () => {
    const t = setup();
    expect(await t.flows.start({ userId: USER, phoneInput: '123' })).toEqual({
      status: 'invalid_phone',
    });
    expect(t.sent).toHaveLength(0);
  });

  it('gửi mã tới E.164, lưu BĂM (không lưu mã thô), hạn 5 phút', async () => {
    const t = setup();
    const result = await t.flows.start({ userId: USER, phoneInput: '0912 345 678' });
    expect(result).toMatchObject({ status: 'sent', maskedPhone: '+849 ••• ••• 678' });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.to).toBe('+84912345678');
    expect(t.sent[0]?.text).toContain('123456');
    const row = t.challenges.get(USER);
    expect(row?.codeHash).toBe(hashOtp(SECRET, USER, '+84912345678', '123456'));
    expect(Object.values(row ?? {}).map(String)).not.toContain('123456');
    expect(row?.expiresAt.getTime()).toBe((row?.sentAt.getTime() ?? 0) + OTP_TTL_SECONDS * 1000);
    expect(OTP_TTL_SECONDS).toBe(300);
  });

  it('gửi lại trong 60 giây → cooldown (không gửi thêm, không tính vào giới hạn)', async () => {
    const t = setup();
    await t.flows.start({ userId: USER, phoneInput: '0912345678' });
    const again = await t.flows.start({ userId: USER, phoneInput: '0912345678' });
    expect(again).toMatchObject({ status: 'cooldown' });
    expect(t.sent).toHaveLength(1);
    t.advance(61);
    expect(await t.flows.start({ userId: USER, phoneInput: '0912345678' })).toMatchObject({
      status: 'sent',
    });
    expect(t.sent).toHaveLength(2);
  });

  it('giới hạn tốc độ theo (người dùng, SĐT): lần thứ 4 trong 10 phút bị chặn', async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) {
      expect(await t.flows.start({ userId: USER, phoneInput: '0912345678' })).toMatchObject({
        status: 'sent',
      });
      t.advance(61);
    }
    expect(await t.flows.start({ userId: USER, phoneInput: '0912345678' })).toMatchObject({
      status: 'rate_limited',
    });
    expect(t.sent).toHaveLength(3);
    // người dùng khác / SĐT khác không bị ảnh hưởng bởi xô (user, phone) này
    expect(await t.flows.start({ userId: USER, phoneInput: '0987654321' })).toMatchObject({
      status: 'sent',
    });
  });

  it('chống liệt kê: phản hồi như nhau dù SĐT đã được người khác xác minh', async () => {
    const t = setup();
    // Bảng không có ràng buộc duy nhất theo SĐT: người thứ hai xin mã cho cùng SĐT vẫn nhận phản hồi y hệt.
    const a = await t.flows.start({ userId: USER, phoneInput: '0912345678' });
    const b = await t.flows.start({ userId: OTHER, phoneInput: '0912345678' });
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a.status).toBe(b.status);
  });

  it('gửi SMS lỗi → send_failed và không để lại mã', async () => {
    const t = setup({ failSms: true });
    expect(await t.flows.start({ userId: USER, phoneInput: '0912345678' })).toEqual({
      status: 'send_failed',
    });
    expect(t.challenges.size).toBe(0);
  });
});

describe('verify', () => {
  it('mã đúng → verified, lưu SĐT đã xác minh, xóa thử thách', async () => {
    const t = setup();
    await t.flows.start({ userId: USER, phoneInput: '0912345678' });
    expect(await t.flows.verify({ userId: USER, code: '123456' })).toEqual({
      status: 'verified',
      maskedPhone: '+849 ••• ••• 678',
    });
    expect(t.verified.get(USER)?.phone).toBe('+84912345678');
    expect(t.challenges.size).toBe(0);
    // dùng lại mã cũ → không được
    expect(await t.flows.verify({ userId: USER, code: '123456' })).toEqual({ status: 'invalid' });
  });

  it('chấp nhận khoảng trắng/gạch khi dán mã', async () => {
    const t = setup();
    await t.flows.start({ userId: USER, phoneInput: '0912345678' });
    expect((await t.flows.verify({ userId: USER, code: ' 123 456 ' })).status).toBe('verified');
  });

  it('mã sai/thiếu/không phải 6 số → invalid (cùng một kết quả)', async () => {
    const t = setup();
    await t.flows.start({ userId: USER, phoneInput: '0912345678' });
    for (const code of ['000000', '12345', '1234567', 'abcdef', '']) {
      expect(await t.flows.verify({ userId: USER, code })).toEqual({ status: 'invalid' });
    }
  });

  it('không có thử thách → invalid (không lộ "chưa từng xin mã")', async () => {
    const t = setup();
    expect(await t.flows.verify({ userId: USER, code: '123456' })).toEqual({ status: 'invalid' });
  });

  it('hết hạn sau 5 phút → invalid dù mã đúng; thử thách bị xóa', async () => {
    const t = setup();
    await t.flows.start({ userId: USER, phoneInput: '0912345678' });
    t.advance(OTP_TTL_SECONDS + 1);
    expect(await t.flows.verify({ userId: USER, code: '123456' })).toEqual({ status: 'invalid' });
    expect(t.challenges.size).toBe(0);
  });

  it('còn đúng hạn tại giây 299', async () => {
    const t = setup();
    await t.flows.start({ userId: USER, phoneInput: '0912345678' });
    t.advance(OTP_TTL_SECONDS - 1);
    expect((await t.flows.verify({ userId: USER, code: '123456' })).status).toBe('verified');
  });

  it(`sai ${OTP_MAX_ATTEMPTS} lần → mã chết, ngay cả nhập đúng sau đó`, async () => {
    const t = setup();
    await t.flows.start({ userId: USER, phoneInput: '0912345678' });
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await t.flows.verify({ userId: USER, code: '000000' })).toEqual({ status: 'invalid' });
    }
    expect(t.challenges.size).toBe(0);
    expect(await t.flows.verify({ userId: USER, code: '123456' })).toEqual({ status: 'invalid' });
    expect(t.verified.size).toBe(0);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });

  it('mã của người dùng khác không dùng được', async () => {
    const t = setup();
    await t.flows.start({ userId: USER, phoneInput: '0912345678' });
    expect(await t.flows.verify({ userId: OTHER, code: '123456' })).toEqual({ status: 'invalid' });
    expect(t.verified.size).toBe(0);
  });

  it('xin mã mới không làm mới số lần đoán: trần theo (người dùng, SĐT) vẫn chặn', async () => {
    const t = setup();
    let limited = false;
    for (let round = 0; round < 4 && !limited; round++) {
      const started = await t.flows.start({ userId: USER, phoneInput: '0912345678' });
      if (started.status !== 'sent') break;
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        const r = await t.flows.verify({ userId: USER, code: '000000' });
        if (r.status === 'rate_limited') limited = true;
      }
      t.advance(61);
    }
    expect(limited).toBe(true);
  });

  it('cờ TẮT → disabled', async () => {
    const t = setup({ enabled: false });
    expect(await t.flows.verify({ userId: USER, code: '123456' })).toEqual({ status: 'disabled' });
  });
});
