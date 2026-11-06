import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COST_NEAR_CAP_RATIO, evaluateCostGate } from './cost-gate';

const base = { spentUsd: 0, reservedUsd: 0, estimateUsd: 0.01, capUsd: 10 };

describe('FR-071 evaluateCostGate — trần chi phí tháng', () => {
  it('không đặt trần (null) → cho gọi', () => {
    expect(evaluateCostGate({ ...base, capUsd: null, spentUsd: 9999 })).toEqual({
      allow: true,
      reason: 'no_cap',
      remainingUsd: null,
      nearCap: false,
    });
  });

  it('còn dư → cho, báo phần còn lại', () => {
    expect(evaluateCostGate({ ...base, spentUsd: 1 })).toMatchObject({
      allow: true,
      reason: 'within_cap',
      remainingUsd: 8.99,
      nearCap: false,
    });
  });

  it('đúng bằng trần sau khi cộng ước tính → vẫn cho (≤ trần)', () => {
    expect(evaluateCostGate({ ...base, spentUsd: 9.99 }).allow).toBe(true);
  });

  it('vượt trần chỉ 1 phần triệu đô → would_exceed', () => {
    expect(evaluateCostGate({ ...base, spentUsd: 9.990001 })).toEqual({
      allow: false,
      reason: 'would_exceed',
    });
  });

  it('đã chi ≥ trần → cap_reached (kể cả ước tính 0)', () => {
    expect(evaluateCostGate({ ...base, spentUsd: 10, estimateUsd: 0 })).toEqual({
      allow: false,
      reason: 'cap_reached',
    });
    expect(evaluateCostGate({ ...base, spentUsd: 11 }).reason).toBe('cap_reached');
  });

  it('phần đang bay (đặt chỗ) được tính vào trần', () => {
    expect(evaluateCostGate({ ...base, spentUsd: 5, reservedUsd: 5 }).reason).toBe('cap_reached');
    expect(evaluateCostGate({ ...base, spentUsd: 5, reservedUsd: 4.99 }).allow).toBe(true);
    expect(evaluateCostGate({ ...base, spentUsd: 5, reservedUsd: 4.991 }).reason).toBe(
      'would_exceed',
    );
  });

  it('trần 0 = tắt AI: chặn mọi lần gọi', () => {
    expect(evaluateCostGate({ ...base, capUsd: 0, estimateUsd: 0 }).reason).toBe('cap_reached');
  });

  it(`nearCap bật từ ${COST_NEAR_CAP_RATIO * 100}% trần`, () => {
    expect(evaluateCostGate({ ...base, spentUsd: 7.98 })).toMatchObject({ nearCap: false });
    expect(evaluateCostGate({ ...base, spentUsd: 7.99 })).toMatchObject({ nearCap: true });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'đầu vào %s → invalid_input (đóng)',
    (bad) => {
      for (const key of ['spentUsd', 'reservedUsd', 'estimateUsd', 'capUsd'] as const) {
        expect(evaluateCostGate({ ...base, [key]: bad })).toEqual({
          allow: false,
          reason: 'invalid_input',
        });
      }
    },
  );

  it('thiếu trường / kiểu sai → invalid_input', () => {
    expect(evaluateCostGate({})).toEqual({ allow: false, reason: 'invalid_input' });
    expect(evaluateCostGate(null)).toEqual({ allow: false, reason: 'invalid_input' });
    expect(evaluateCostGate({ ...base, spentUsd: '1' })).toEqual({
      allow: false,
      reason: 'invalid_input',
    });
  });
});

describe('FR-071 evaluateCostGate — property-based', () => {
  // Số nguyên micro-đô / 1e6 để tránh sai số dấu phẩy động ở chính bài kiểm.
  const usd = fc.integer({ min: 0, max: 50_000_000 }).map((n) => n / 1e6);
  const cap = fc.integer({ min: 0, max: 100_000_000 }).map((n) => n / 1e6);
  const micro = (n: number) => Math.round(n * 1e6);

  it('cho gọi ⇒ tổng đã chi + đang bay + ước tính ≤ trần', () => {
    fc.assert(
      fc.property(usd, usd, usd, cap, (spentUsd, reservedUsd, estimateUsd, capUsd) => {
        const d = evaluateCostGate({ spentUsd, reservedUsd, estimateUsd, capUsd });
        if (d.allow) {
          expect(micro(spentUsd) + micro(reservedUsd) + micro(estimateUsd)).toBeLessThanOrEqual(
            micro(capUsd),
          );
        }
      }),
    );
  });

  it('chặn ⇒ tổng > trần hoặc đã chi ≥ trần (không chặn oan)', () => {
    fc.assert(
      fc.property(usd, usd, usd, cap, (spentUsd, reservedUsd, estimateUsd, capUsd) => {
        const d = evaluateCostGate({ spentUsd, reservedUsd, estimateUsd, capUsd });
        if (!d.allow) {
          const used = micro(spentUsd) + micro(reservedUsd);
          expect(used + micro(estimateUsd) > micro(capUsd) || used >= micro(capUsd)).toBe(true);
        }
      }),
    );
  });

  it('đơn điệu: chi tiêu tăng không bao giờ biến "chặn" thành "cho"', () => {
    fc.assert(
      fc.property(usd, usd, usd, usd, cap, (spent, extra, reservedUsd, estimateUsd, capUsd) => {
        const low = evaluateCostGate({ spentUsd: spent, reservedUsd, estimateUsd, capUsd });
        const high = evaluateCostGate({
          spentUsd: spent + extra,
          reservedUsd,
          estimateUsd,
          capUsd,
        });
        if (!low.allow) expect(high.allow).toBe(false);
      }),
    );
  });

  it('không trần → luôn cho', () => {
    fc.assert(
      fc.property(usd, usd, usd, (spentUsd, reservedUsd, estimateUsd) => {
        expect(evaluateCostGate({ spentUsd, reservedUsd, estimateUsd, capUsd: null }).allow).toBe(
          true,
        );
      }),
    );
  });
});
