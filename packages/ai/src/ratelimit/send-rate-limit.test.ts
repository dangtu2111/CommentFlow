import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEND_RATE_LIMITS, evaluateSendRate, type SendRateInput } from './send-rate-limit';

const L = DEFAULT_SEND_RATE_LIMITS;
const zero = { pageMinute: 0, pageHour: 0, pageAutoHour: 0, postAuto10m: 0, repeatHour: 0 };

const base = (over: Partial<SendRateInput> = {}): SendRateInput => ({
  mode: 'auto',
  counts: { ...zero },
  appUsagePercent: null,
  ...over,
});
const counts = (over: Partial<typeof zero>) => ({ ...zero, ...over });
const outcomeOf = (over: Partial<SendRateInput>) => evaluateSendRate(base(over)).outcome;

describe('FR-114 evaluateSendRate — giới hạn mọi câu gửi theo Page (hoãn)', () => {
  it('dưới ngưỡng → cho qua, remaining = lượt còn lại nhỏ nhất', () => {
    const r = evaluateSendRate(base({ counts: counts({ pageMinute: 29, pageHour: 100 }) }));
    expect(r).toMatchObject({ outcome: 'allow', block: null, remaining: 1 });
  });
  it('đúng 30 câu/phút → hoãn (ca biên ±1)', () => {
    expect(outcomeOf({ counts: counts({ pageMinute: L.pagePerMinute - 1 }) })).toBe('allow');
    expect(
      evaluateSendRate(base({ counts: counts({ pageMinute: L.pagePerMinute }) })),
    ).toMatchObject({
      outcome: 'defer',
      block: 'page_minute',
      remaining: 0,
    });
  });
  it('đúng 600 câu/giờ → hoãn; người gửi cũng bị hoãn', () => {
    expect(outcomeOf({ mode: 'human', counts: counts({ pageHour: L.pagePerHour - 1 }) })).toBe(
      'allow',
    );
    expect(
      evaluateSendRate(base({ mode: 'human', counts: counts({ pageHour: L.pagePerHour }) })),
    ).toMatchObject({
      outcome: 'defer',
      block: 'page_hour',
    });
  });
});

describe('FR-114 evaluateSendRate — giới hạn riêng của tự gửi (về Chờ duyệt)', () => {
  it('60 câu tự gửi/giờ/Page', () => {
    expect(outcomeOf({ counts: counts({ pageAutoHour: L.autoPerHour - 1 }) })).toBe('allow');
    expect(
      evaluateSendRate(base({ counts: counts({ pageAutoHour: L.autoPerHour }) })),
    ).toMatchObject({
      outcome: 'hold',
      block: 'page_auto_hour',
    });
  });
  it('20 câu tự gửi/10 phút/bài', () => {
    expect(outcomeOf({ counts: counts({ postAuto10m: L.postPer10Min - 1 }) })).toBe('allow');
    expect(
      evaluateSendRate(base({ counts: counts({ postAuto10m: L.postPer10Min }) })),
    ).toMatchObject({
      outcome: 'hold',
      block: 'post_auto_10m',
    });
  });
  it('≤ 5 câu giống hệt/giờ/Page: câu thứ 6 về Chờ duyệt', () => {
    expect(outcomeOf({ counts: counts({ repeatHour: L.repeatPerHour - 1 }) })).toBe('allow');
    expect(
      evaluateSendRate(base({ counts: counts({ repeatHour: L.repeatPerHour }) })),
    ).toMatchObject({
      outcome: 'hold',
      block: 'repeat_content',
    });
  });
  it('người gửi KHÔNG bị ba giới hạn tự gửi', () => {
    const c = counts({ pageAutoHour: 999, postAuto10m: 999, repeatHour: 999 });
    expect(outcomeOf({ mode: 'human', counts: c })).toBe('allow');
  });
  it('hoãn (Page) ưu tiên hơn Chờ duyệt khi vượt cả hai', () => {
    expect(outcomeOf({ counts: counts({ pageMinute: 30, repeatHour: 9 }) })).toBe('defer');
  });
});

describe('FR-114 evaluateSendRate — mức dùng Meta App toàn hệ thống', () => {
  it('≥ 75% giảm nửa giới hạn tự gửi (60 → 30)', () => {
    const c = counts({ pageAutoHour: 30 });
    expect(outcomeOf({ counts: c, appUsagePercent: 74.9 })).toBe('allow');
    expect(evaluateSendRate(base({ counts: c, appUsagePercent: 75 }))).toMatchObject({
      outcome: 'hold',
      block: 'page_auto_hour',
    });
  });
  it('≥ 75% không giảm giới hạn của người gửi', () => {
    expect(
      outcomeOf({ mode: 'human', counts: counts({ pageMinute: 29 }), appUsagePercent: 80 }),
    ).toBe('allow');
  });
  it('≥ 90% tự gửi bị hoãn, người bấm vẫn qua', () => {
    expect(evaluateSendRate(base({ appUsagePercent: 90 }))).toMatchObject({
      outcome: 'defer',
      block: 'app_usage',
    });
    expect(outcomeOf({ appUsagePercent: 89.9 })).toBe('allow');
    expect(outcomeOf({ mode: 'human', appUsagePercent: 99 })).toBe('allow');
  });
  it('thiếu thông tin (null) → không giảm tốc', () => {
    expect(outcomeOf({ appUsagePercent: null })).toBe('allow');
  });
  it('halved (tăng đột biến §11.2) cũng giảm nửa giới hạn tự gửi', () => {
    expect(outcomeOf({ counts: counts({ postAuto10m: 10 }), halved: true })).toBe('hold');
  });
});

describe('FR-114 evaluateSendRate — đầu vào hỏng → đóng (không cho qua)', () => {
  it.each([
    { pageMinute: -1 },
    { pageHour: Number.NaN },
    { repeatHour: 1.5 },
    { postAuto10m: Number.POSITIVE_INFINITY },
  ])('đếm hỏng %j → hoãn', (bad) => {
    expect(evaluateSendRate(base({ counts: counts(bad) }))).toMatchObject({
      outcome: 'defer',
      block: 'input',
    });
  });
  it('mode lạ, % ngoài 0–100, hoặc không phải object → hoãn', () => {
    expect(evaluateSendRate({ ...base(), mode: 'x' } as never).outcome).toBe('defer');
    expect(outcomeOf({ appUsagePercent: 101 })).toBe('defer');
    expect(evaluateSendRate(null as never).outcome).toBe('defer');
  });
});

const countsArb = fc.record({
  pageMinute: fc.nat(100),
  pageHour: fc.nat(1000),
  pageAutoHour: fc.nat(100),
  postAuto10m: fc.nat(50),
  repeatHour: fc.nat(20),
});
const modeArb = fc.constantFrom('human' as const, 'auto' as const);
const usageArb = fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: null });
const keyArb = fc.constantFrom(...(Object.keys(zero) as (keyof typeof zero)[]));

describe('FR-114 evaluateSendRate — tính chất', () => {
  it('remaining luôn nguyên ≥ 0; allow ⇒ remaining ≥ 1; không allow ⇒ block khác null', () => {
    fc.assert(
      fc.property(modeArb, countsArb, usageArb, (mode, c, u) => {
        const r = evaluateSendRate({ mode, counts: c, appUsagePercent: u });
        expect(Number.isInteger(r.remaining) && r.remaining >= 0).toBe(true);
        if (r.outcome === 'allow') {
          expect(r.remaining).toBeGreaterThanOrEqual(1);
          expect(r.block).toBeNull();
        } else {
          expect(r.block).not.toBeNull();
        }
      }),
    );
  });
  it('người gửi không bao giờ bị hold', () => {
    fc.assert(
      fc.property(countsArb, usageArb, (c, u) => {
        expect(evaluateSendRate({ mode: 'human', counts: c, appUsagePercent: u }).outcome).not.toBe(
          'hold',
        );
      }),
    );
  });
  it('đơn điệu: tăng bộ đếm không bao giờ làm kết quả thoáng hơn', () => {
    const rank = { allow: 0, hold: 1, defer: 2 } as const;
    fc.assert(
      fc.property(modeArb, countsArb, keyArb, fc.nat(5), (mode, c, key, d) => {
        const a = evaluateSendRate({ mode, counts: c, appUsagePercent: null });
        const more = { ...c, [key]: c[key] + d };
        const b = evaluateSendRate({ mode, counts: more, appUsagePercent: null });
        expect(rank[b.outcome]).toBeGreaterThanOrEqual(rank[a.outcome]);
      }),
    );
  });
  it('thứ tự khóa của counts không đổi kết quả', () => {
    fc.assert(
      fc.property(modeArb, countsArb, (mode, c) => {
        const shuffled = Object.fromEntries(Object.entries(c).reverse()) as typeof c;
        expect(evaluateSendRate({ mode, counts: shuffled, appUsagePercent: null })).toEqual(
          evaluateSendRate({ mode, counts: c, appUsagePercent: null }),
        );
      }),
    );
  });
});
