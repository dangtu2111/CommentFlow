import { describe, expect, it } from 'vitest';
import {
  canConsume,
  parseConsumeInput,
  USAGE_WARN_PERCENT,
  usagePeriodStart,
  usageStatus,
} from './usage';

describe('FR-090 usageStatus — đồng hồ lượt AI', () => {
  it('FR-090 dưới 80% là ok, còn nguyên số lượt', () => {
    expect(usageStatus({ used: 0, limit: 1000 })).toEqual({
      capacity: 1000,
      remaining: 1000,
      percent: 0,
      level: 'ok',
    });
    expect(usageStatus({ used: 799, limit: 1000 }).level).toBe('ok');
  });

  it('FR-090 đúng 80% trở lên là warning (BR-06), ngưỡng là số nguyên không làm tròn', () => {
    expect(USAGE_WARN_PERCENT).toBe(80);
    expect(usageStatus({ used: 800, limit: 1000 }).level).toBe('warning');
    expect(usageStatus({ used: 999, limit: 1000 })).toMatchObject({
      level: 'warning',
      remaining: 1,
      percent: 99,
    });
    // 4/5 = 80% đúng
    expect(usageStatus({ used: 4, limit: 5 }).level).toBe('warning');
    expect(usageStatus({ used: 3, limit: 5 }).level).toBe('ok');
  });

  it('FR-090 đủ 100% là blocked (chặn AI), kể cả vượt do hạ hạn mức; remaining không âm; percent tối đa 100', () => {
    expect(usageStatus({ used: 1000, limit: 1000 })).toMatchObject({
      level: 'blocked',
      remaining: 0,
      percent: 100,
    });
    expect(usageStatus({ used: 1200, limit: 1000 })).toMatchObject({
      level: 'blocked',
      remaining: 0,
      percent: 100,
    });
  });

  it('FR-090 hạn mức 0 (gói không có AI) luôn blocked', () => {
    expect(usageStatus({ used: 0, limit: 0 })).toMatchObject({ level: 'blocked', percent: 100 });
  });

  it('FR-090 lượt mua thêm (addon) cộng vào hạn mức', () => {
    expect(usageStatus({ used: 1000, limit: 1000, addon: 1000 })).toMatchObject({
      capacity: 2000,
      remaining: 1000,
      percent: 50,
      level: 'ok',
    });
    expect(usageStatus({ used: 1000, limit: 0, addon: 1000 }).level).toBe('blocked');
  });
});

describe('FR-090 canConsume — chặn ở 100%', () => {
  it('FR-090 đúng ngưỡng ±1', () => {
    expect(canConsume({ used: 998, limit: 1000 }, 2)).toBe(true);
    expect(canConsume({ used: 999, limit: 1000 }, 2)).toBe(false);
    expect(canConsume({ used: 1000, limit: 1000 }, 1)).toBe(false);
    expect(canConsume({ used: 1000, limit: 1000, addon: 1 }, 1)).toBe(true);
  });

  it('FR-090 số lượng không hợp lệ (≤ 0, không nguyên) không bao giờ cho phép', () => {
    for (const amount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(canConsume({ used: 0, limit: 1000 }, amount)).toBe(false);
    }
  });
});

describe('FR-090 usagePeriodStart — kỳ tính theo tháng ở múi giờ workspace', () => {
  it('FR-090 trả ngày 1 của tháng theo múi giờ', () => {
    expect(usagePeriodStart(new Date('2026-11-15T05:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-11-01',
    );
  });

  it('FR-090 ca biên cuối/đầu tháng: cùng thời điểm UTC, khác tháng theo múi giờ', () => {
    // 2026-10-31T17:00Z = 2026-11-01 00:00 giờ Việt Nam
    expect(usagePeriodStart(new Date('2026-10-31T16:59:59Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-10-01',
    );
    expect(usagePeriodStart(new Date('2026-10-31T17:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-11-01',
    );
    expect(usagePeriodStart(new Date('2026-10-31T17:00:00Z'), 'UTC')).toBe('2026-10-01');
  });

  it('FR-090 sang năm mới', () => {
    expect(usagePeriodStart(new Date('2026-12-31T20:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2027-01-01',
    );
  });

  it('FR-090 múi giờ lạ hoặc thời điểm không hợp lệ → lỗi rõ ràng', () => {
    expect(() => usagePeriodStart(new Date('2026-11-15T00:00:00Z'), 'Mars/Olympus')).toThrow(
      /múi giờ/i,
    );
    expect(() => usagePeriodStart(new Date('khong-hop-le'), 'UTC')).toThrow(/thời điểm/i);
  });
});

describe('FR-090 parseConsumeInput — kiểm đầu vào ở ranh giới', () => {
  const ok = { product: 'commentflow', meter: 'ai_turns', limit: 1000 };

  it('FR-090 mặc định amount = 1; giữ nguyên các trường hợp lệ', () => {
    expect(parseConsumeInput(ok)).toEqual({
      product: 'commentflow',
      meter: 'ai_turns',
      amount: 1,
      limit: 1000,
    });
    expect(parseConsumeInput({ ...ok, product: 'excelflow', amount: 5, limit: 0 })).toMatchObject({
      product: 'excelflow',
      amount: 5,
      limit: 0,
    });
  });

  it('FR-090 từ chối sản phẩm/meter lạ, số lượng ≤ 0 hoặc quá lớn, hạn mức âm/không nguyên/quá lớn', () => {
    for (const bad of [
      { ...ok, product: 'tiktok' },
      { ...ok, meter: 'AI Turns' },
      { ...ok, meter: '' },
      { ...ok, amount: 0 },
      { ...ok, amount: -3 },
      { ...ok, amount: 1001 },
      { ...ok, amount: 1.5 },
      { ...ok, limit: -1 },
      { ...ok, limit: 1.5 },
      { ...ok, limit: 1_000_000_001 },
      { product: 'commentflow', meter: 'ai_turns' },
    ]) {
      expect(() => parseConsumeInput(bad)).toThrow();
    }
  });

  it('FR-090 lỗi là AppError VALIDATION_FAILED, không lộ giá trị đầu vào', () => {
    try {
      parseConsumeInput({ ...ok, limit: -7 });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(String((error as Error).message)).not.toContain('-7');
    }
  });
});
