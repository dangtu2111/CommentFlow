import { describe, expect, it } from 'vitest';
import { formatCount, formatVnd, PLAN_CATALOG, planByCode, yearlyPriceVnd } from './plan-catalog';

describe('FR-090 danh mục gói hiển thị (docs/10 §3 — tạm đến khi có bảng plans)', () => {
  it('đúng số liệu docs/10: Starter 299k/1/1.000, Growth 699k/3/3.000, Business 1.490k/10/7.500', () => {
    expect(PLAN_CATALOG.map((p) => [p.code, p.priceVnd, p.channelsLimit, p.monthlyTurns])).toEqual([
      ['starter', 299_000, 1, 1000],
      ['growth', 699_000, 3, 3000],
      ['business', 1_490_000, 10, 7500],
    ]);
  });
  it('chỉ Growth/Business có AI tự trả lời (BR-05)', () => {
    expect(PLAN_CATALOG.filter((p) => p.autoReply).map((p) => p.code)).toEqual([
      'growth',
      'business',
    ]);
  });
  it('planByCode trả undefined cho mã lạ', () => {
    expect(planByCode('growth')?.priceVnd).toBe(699_000);
    expect(planByCode('enterprise')).toBeUndefined();
  });
  it('formatVnd dùng dấu chấm ngăn nghìn', () => {
    expect(formatVnd(1_490_000)).toBe('1.490.000đ');
    expect(formatVnd(0)).toBe('0đ');
  });
  it('formatCount ngăn nghìn không kèm đơn vị', () => {
    expect(formatCount(3000)).toBe('3.000');
    expect(formatCount(300)).toBe('300');
  });
  it('yearlyPriceVnd giảm 20% trên 12 tháng, làm tròn xuống nghìn', () => {
    expect(yearlyPriceVnd(699_000)).toBe(6_710_000);
  });
});
