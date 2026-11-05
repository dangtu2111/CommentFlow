import { describe, expect, it } from 'vitest';
import { collectActionableCounts, formatActionableCount } from './workspace-count';

describe('FR-005 formatActionableCount — nhãn số cần xử lý', () => {
  it('FR-005 0, âm, rỗng hoặc không đọc được → không hiện nhãn', () => {
    expect(formatActionableCount(0)).toBeNull();
    expect(formatActionableCount(-3)).toBeNull();
    expect(formatActionableCount(null)).toBeNull();
    expect(formatActionableCount(undefined)).toBeNull();
  });

  it('FR-005 1–99 hiện nguyên số; từ 100 trở lên hiện 99+', () => {
    expect(formatActionableCount(1)).toBe('1');
    expect(formatActionableCount(99)).toBe('99');
    expect(formatActionableCount(100)).toBe('99+');
    expect(formatActionableCount(12345)).toBe('99+');
  });
});

describe('FR-005 collectActionableCounts — đếm từng workspace, lỗi một nơi không hỏng cả danh sách', () => {
  const memberships = [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }];

  it('FR-005 trả số theo id workspace', async () => {
    const counts = await collectActionableCounts(memberships, async (id) =>
      id === 'w1' ? 5 : id === 'w2' ? 0 : 120,
    );
    expect(counts).toEqual({ w1: 5, w2: 0, w3: 120 });
  });

  it('FR-005 một workspace lỗi → null cho workspace đó, các nơi khác vẫn có số', async () => {
    const counts = await collectActionableCounts(memberships, async (id) => {
      if (id === 'w2') throw new Error('db chập chờn');
      return 7;
    });
    expect(counts).toEqual({ w1: 7, w2: null, w3: 7 });
  });

  it('FR-005 danh sách rỗng → đối tượng rỗng, không gọi đếm', async () => {
    let calls = 0;
    const counts = await collectActionableCounts([], async () => {
      calls += 1;
      return 1;
    });
    expect(counts).toEqual({});
    expect(calls).toBe(0);
  });
});
