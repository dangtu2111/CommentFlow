import { describe, expect, it } from 'vitest';
import { applyDistillRank } from './distill-rank';

const raw = (id: string) => ({ chunkKey: id, distilled: false, sourceKey: null });
const dis = (id: string, from: string | null) => ({
  chunkKey: id,
  distilled: true,
  sourceKey: from,
});
const ids = (items: Array<{ chunkKey: string }>) => items.map((i) => i.chunkKey);

describe('applyDistillRank', () => {
  it('quy tắc 1: bỏ đoạn chắt lọc khi đoạn thô nguồn đã có trong kết quả; nguồn không có mặt thì giữ', () => {
    const out = applyDistillRank([dis('d1', 'r1'), raw('r1'), dis('d2', 'rX'), raw('r2')]);
    expect(ids(out)).toEqual(['r1', 'd2', 'r2']);
  });

  it('quy tắc 2: tối đa 3 đoạn chắt lọc trong 10 chỗ, chỗ còn lại trả cho đoạn thô', () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => dis(`d${i}`, `x${i}`)),
      ...Array.from({ length: 10 }, (_, i) => raw(`r${i}`)),
    ];
    const out = applyDistillRank(items, 10);
    expect(out).toHaveLength(10);
    expect(out.filter((i) => i.distilled)).toHaveLength(3);
    expect(ids(out).slice(0, 3)).toEqual(['d0', 'd1', 'd2']);
    expect(ids(out)).toContain('r6');
  });

  it('đoạn thô nguồn nằm ngoài cửa sổ → đoạn chắt lọc vẫn giữ (không có mặt trong kết quả)', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => raw(`r${i}`)),
      dis('d', 'r10'),
      raw('r10'),
    ];
    const out = applyDistillRank(items, 10);
    expect(ids(out)).toEqual(Array.from({ length: 10 }, (_, i) => `r${i}`));
  });

  it('đoạn chắt lọc không tra được nguồn (sourceKey null) → không dò trùng nhưng vẫn tính vào trần', () => {
    const out = applyDistillRank([dis('d1', null), raw('r1')]);
    expect(ids(out)).toEqual(['d1', 'r1']);
  });

  it('không có cửa sổ: không giới hạn độ dài nhưng vẫn áp trần 3', () => {
    const items = [1, 2, 3, 4].map((i) => dis(`d${i}`, `x${i}`));
    expect(applyDistillRank(items)).toHaveLength(3);
  });
});
