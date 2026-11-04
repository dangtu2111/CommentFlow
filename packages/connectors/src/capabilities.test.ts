import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type ActionCapability,
  type ConnectorCapabilities,
  evaluateAction,
  textLengthOf,
} from './capabilities';

const HOUR = 3_600_000;
const T0 = new Date('2026-11-04T00:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);

const none: ActionCapability = { supported: false, verified: true };
const caps = (over: Partial<ConnectorCapabilities>): ConnectorCapabilities => ({
  reply: none,
  hide: none,
  unhide: none,
  privateReply: none,
  sendMessage: none,
  ...over,
});

const tiktokLike = caps({
  reply: {
    supported: true,
    verified: false,
    maxTextLength: 150,
    windows: [{ withinMs: 48 * HOUR, humanOnly: false }],
  },
});
const messengerLike = caps({
  sendMessage: {
    supported: true,
    verified: true,
    windows: [
      { withinMs: 24 * HOUR, humanOnly: false },
      { withinMs: 7 * 24 * HOUR, humanOnly: true },
    ],
  },
});
const onceLike = caps({
  privateReply: {
    supported: true,
    verified: true,
    oncePerTarget: true,
    windows: [{ withinMs: 7 * 24 * HOUR, humanOnly: false }],
  },
});

const ctx = (over: Record<string, unknown> = {}) => ({
  referenceAt: T0,
  now: after(HOUR),
  byHuman: false,
  alreadyUsed: false,
  ...over,
});

describe('FR-016 evaluateAction — hành động được phép', () => {
  it('FR-016 hành động không hỗ trợ → ACTION_UNSUPPORTED (ví dụ TikTok không có Ẩn)', () => {
    expect(evaluateAction(tiktokLike, 'hide', ctx())).toEqual({
      allowed: false,
      reason: 'ACTION_UNSUPPORTED',
    });
    for (const action of ['unhide', 'privateReply', 'sendMessage'] as const) {
      expect(evaluateAction(tiktokLike, action, ctx())).toMatchObject({
        allowed: false,
        reason: 'ACTION_UNSUPPORTED',
      });
    }
  });

  it('FR-016 hỗ trợ và không có cửa sổ/giới hạn → được phép, kể cả khi không biết độ dài', () => {
    const open = caps({ hide: { supported: true, verified: true } });
    expect(evaluateAction(open, 'hide', ctx({ now: after(10_000 * HOUR) }))).toEqual({
      allowed: true,
      humanOnly: false,
    });
  });
});

describe('FR-016 evaluateAction — cửa sổ thời gian', () => {
  it('FR-016 TikTok trả lời: trong 48 giờ được, đúng 48 giờ được (biên), quá 1 ms thì WINDOW_EXPIRED', () => {
    const base = { textLength: 10 };
    expect(evaluateAction(tiktokLike, 'reply', ctx({ ...base, now: after(0) }))).toMatchObject({
      allowed: true,
    });
    expect(
      evaluateAction(tiktokLike, 'reply', ctx({ ...base, now: after(48 * HOUR) })),
    ).toMatchObject({
      allowed: true,
    });
    expect(
      evaluateAction(tiktokLike, 'reply', ctx({ ...base, now: after(48 * HOUR + 1) })),
    ).toEqual({
      allowed: false,
      reason: 'WINDOW_EXPIRED',
    });
  });

  it('FR-016 mốc tham chiếu ở tương lai (đồng hồ lệch) coi như 0, không làm hỏng cửa sổ', () => {
    expect(
      evaluateAction(
        tiktokLike,
        'reply',
        ctx({ textLength: 5, referenceAt: after(5 * HOUR), now: T0 }),
      ),
    ).toMatchObject({ allowed: true });
  });

  it('FR-016 Messenger: trong 24 giờ AI được; 24 giờ–7 ngày chỉ người; quá 7 ngày không gửi', () => {
    const base = { textLength: 20 };
    expect(
      evaluateAction(messengerLike, 'sendMessage', ctx({ ...base, now: after(23 * HOUR) })),
    ).toEqual({
      allowed: true,
      humanOnly: false,
    });
    // đúng 24 giờ vẫn là cửa sổ tự động (biên)
    expect(
      evaluateAction(messengerLike, 'sendMessage', ctx({ ...base, now: after(24 * HOUR) })),
    ).toEqual({
      allowed: true,
      humanOnly: false,
    });
    expect(
      evaluateAction(messengerLike, 'sendMessage', ctx({ ...base, now: after(24 * HOUR + 1) })),
    ).toEqual({
      allowed: false,
      reason: 'HUMAN_REQUIRED',
    });
    expect(
      evaluateAction(
        messengerLike,
        'sendMessage',
        ctx({ ...base, now: after(3 * 24 * HOUR), byHuman: true }),
      ),
    ).toEqual({ allowed: true, humanOnly: true });
    expect(
      evaluateAction(
        messengerLike,
        'sendMessage',
        ctx({ ...base, now: after(7 * 24 * HOUR), byHuman: true }),
      ),
    ).toMatchObject({ allowed: true });
    expect(
      evaluateAction(
        messengerLike,
        'sendMessage',
        ctx({ ...base, now: after(7 * 24 * HOUR + 1), byHuman: true }),
      ),
    ).toEqual({ allowed: false, reason: 'WINDOW_EXPIRED' });
  });
});

describe('FR-016 evaluateAction — giới hạn ký tự và hành động một lần', () => {
  it('FR-016 TikTok: 150 ký tự được, 151 thì TEXT_TOO_LONG, thiếu độ dài thì TEXT_REQUIRED (đóng khi không chắc)', () => {
    expect(evaluateAction(tiktokLike, 'reply', ctx({ textLength: 150 }))).toMatchObject({
      allowed: true,
    });
    expect(evaluateAction(tiktokLike, 'reply', ctx({ textLength: 151 }))).toEqual({
      allowed: false,
      reason: 'TEXT_TOO_LONG',
    });
    expect(evaluateAction(tiktokLike, 'reply', ctx({ textLength: 0 }))).toMatchObject({
      allowed: true,
    });
    expect(evaluateAction(tiktokLike, 'reply', ctx())).toEqual({
      allowed: false,
      reason: 'TEXT_REQUIRED',
    });
  });

  it('FR-016 độ dài âm hoặc không phải số nguyên bị từ chối (đầu vào sai không được lọt)', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(evaluateAction(tiktokLike, 'reply', ctx({ textLength: bad }))).toEqual({
        allowed: false,
        reason: 'TEXT_REQUIRED',
      });
    }
  });

  it('FR-016 nhắn riêng từ bình luận chỉ một lần: lần hai ALREADY_USED; quá 7 ngày WINDOW_EXPIRED', () => {
    expect(evaluateAction(onceLike, 'privateReply', ctx())).toMatchObject({ allowed: true });
    expect(evaluateAction(onceLike, 'privateReply', ctx({ alreadyUsed: true }))).toEqual({
      allowed: false,
      reason: 'ALREADY_USED',
    });
    expect(
      evaluateAction(onceLike, 'privateReply', ctx({ now: after(7 * 24 * HOUR + 1) })),
    ).toEqual({
      allowed: false,
      reason: 'WINDOW_EXPIRED',
    });
  });

  it('FR-016 thứ tự kiểm cố định: UNSUPPORTED → ALREADY_USED → WINDOW_EXPIRED → HUMAN_REQUIRED → TEXT', () => {
    const everything = caps({
      reply: {
        supported: true,
        verified: true,
        oncePerTarget: true,
        maxTextLength: 5,
        windows: [{ withinMs: HOUR, humanOnly: true }],
      },
    });
    const bad = { now: after(2 * HOUR), alreadyUsed: true, byHuman: false, textLength: 99 };
    expect(evaluateAction(everything, 'reply', ctx(bad))).toMatchObject({ reason: 'ALREADY_USED' });
    expect(evaluateAction(everything, 'reply', ctx({ ...bad, alreadyUsed: false }))).toMatchObject({
      reason: 'WINDOW_EXPIRED',
    });
    expect(
      evaluateAction(everything, 'reply', ctx({ ...bad, alreadyUsed: false, now: after(HOUR) })),
    ).toMatchObject({
      reason: 'HUMAN_REQUIRED',
    });
    expect(
      evaluateAction(
        everything,
        'reply',
        ctx({ ...bad, alreadyUsed: false, now: after(HOUR), byHuman: true }),
      ),
    ).toMatchObject({ reason: 'TEXT_TOO_LONG' });
  });
});

describe('FR-016 textLengthOf', () => {
  it('đếm theo ký tự (điểm mã), không theo đơn vị UTF-16: emoji và dấu tiếng Việt tính 1', () => {
    expect(textLengthOf('')).toBe(0);
    expect(textLengthOf('Xin chào')).toBe(8);
    expect(textLengthOf('😀')).toBe(1);
    expect(textLengthOf('ệ😀a')).toBe(3);
  });
});

describe('FR-016 evaluateAction — thuộc tính (property-based)', () => {
  const windowArb = fc
    .array(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 4 })
    .map((steps) => {
      let total = 0;
      return steps.map((s, i) => {
        total += s * HOUR;
        return { withinMs: total, humanOnly: i > 0 };
      });
    });

  it('FR-016 đơn điệu theo thời gian: đã WINDOW_EXPIRED ở thời điểm t thì mọi t′ > t cũng WINDOW_EXPIRED', () => {
    fc.assert(
      fc.property(
        windowArb,
        fc.nat(100_000),
        fc.nat(100_000),
        fc.boolean(),
        (windows, a, b, byHuman) => {
          const c = caps({ reply: { supported: true, verified: true, windows } });
          const t1 = Math.min(a, b) * HOUR;
          const t2 = Math.max(a, b) * HOUR;
          const r1 = evaluateAction(c, 'reply', ctx({ now: after(t1), byHuman }));
          const r2 = evaluateAction(c, 'reply', ctx({ now: after(t2), byHuman }));
          if (!r1.allowed && r1.reason === 'WINDOW_EXPIRED') {
            expect(r2).toEqual({ allowed: false, reason: 'WINDOW_EXPIRED' });
          }
        },
      ),
    );
  });

  it('FR-016 người luôn được phép bằng hoặc hơn máy: nếu máy được thì người cũng được', () => {
    fc.assert(
      fc.property(windowArb, fc.nat(100_000), (windows, t) => {
        const c = caps({ reply: { supported: true, verified: true, windows } });
        const machine = evaluateAction(c, 'reply', ctx({ now: after(t * HOUR), byHuman: false }));
        const human = evaluateAction(c, 'reply', ctx({ now: after(t * HOUR), byHuman: true }));
        if (machine.allowed) expect(human.allowed).toBe(true);
      }),
    );
  });

  it('FR-016 giới hạn ký tự: độ dài ≤ max (và trong cửa sổ) luôn được, > max luôn TEXT_TOO_LONG', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: 1000 }),
        (max, len) => {
          const c = caps({ reply: { supported: true, verified: true, maxTextLength: max } });
          const r = evaluateAction(c, 'reply', ctx({ textLength: len }));
          expect(r.allowed).toBe(len <= max);
          if (!r.allowed) expect(r.reason).toBe('TEXT_TOO_LONG');
        },
      ),
    );
  });
});
