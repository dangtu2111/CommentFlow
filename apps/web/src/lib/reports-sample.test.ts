import { describe, expect, it } from 'vitest';
import { donutArcs, INTENT_SAMPLE, TREND_SAMPLE } from './reports-sample';

describe('donutArcs', () => {
  it('mỗi lát bắt đầu đúng chỗ lát trước kết thúc (độ lệch âm lũy kế)', () => {
    const arcs = donutArcs([{ pct: 50 }, { pct: 30 }, { pct: 20 }]);
    const circumference = 2 * Math.PI * 38;
    expect(arcs).toHaveLength(3);
    expect(arcs[0]?.offset).toBeCloseTo(0);
    expect(arcs[1]?.offset).toBeCloseTo(-(arcs[0]?.dash ?? 0));
    expect(arcs[2]?.offset).toBeCloseTo(-((arcs[0]?.dash ?? 0) + (arcs[1]?.dash ?? 0)));
    expect(arcs.reduce((sum, arc) => sum + arc.dash, 0)).toBeCloseTo(circumference);
  });

  it('danh sách rỗng → không có lát', () => {
    expect(donutArcs([])).toEqual([]);
  });

  it('dữ liệu mẫu ý định cộng đúng 100%', () => {
    expect(INTENT_SAMPLE.reduce((sum, slice) => sum + slice.pct, 0)).toBe(100);
  });
});

describe('TREND_SAMPLE', () => {
  it('cột xếp chồng nằm gọn trong khung biểu đồ (đáy 180, đỉnh ≥ 0)', () => {
    for (const bucket of TREND_SAMPLE) {
      expect(180 - bucket.skipped - bucket.reviewed - bucket.ai).toBeGreaterThanOrEqual(0);
    }
  });
});
