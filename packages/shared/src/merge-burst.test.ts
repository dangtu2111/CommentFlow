import { describe, expect, it } from 'vitest';
import {
  burstKey,
  clampMergeWindowSeconds,
  DEFAULT_MERGE_WINDOW_SECONDS,
  isBurstReady,
  MAX_BURST_SIZE,
  mergeBurstText,
  planMergeBurst,
} from './merge-burst';

const T0 = Date.UTC(2026, 10, 6, 9, 0, 0);
type Over = Partial<{
  postId: string;
  authorExternalId: string;
  createdAt: Date | number;
  text: string;
}>;
const c = (id: string, sec: number, over: Over = {}) => ({
  id,
  postId: 'p1',
  authorExternalId: 'u1',
  createdAt: new Date(T0 + sec * 1000),
  text: `t-${id}`,
  ...over,
});

describe('FR-148 clampMergeWindowSeconds', () => {
  it('mặc định 30; ép 10–60; không hợp lệ → 30', () => {
    expect(DEFAULT_MERGE_WINDOW_SECONDS).toBe(30);
    expect(clampMergeWindowSeconds(undefined)).toBe(30);
    expect(clampMergeWindowSeconds(Number.NaN)).toBe(30);
    expect(clampMergeWindowSeconds(5)).toBe(10);
    expect(clampMergeWindowSeconds(10)).toBe(10);
    expect(clampMergeWindowSeconds(45.7)).toBe(45);
    expect(clampMergeWindowSeconds(60)).toBe(60);
    expect(clampMergeWindowSeconds(600)).toBe(60);
  });
});

describe('US-109 FR-148 planMergeBurst', () => {
  it('ba bình luận liên tiếp < 30 giây → một nhóm, trả lời vào bình luận cuối', () => {
    const [g, ...rest] = planMergeBurst([c('a', 0), c('b', 10), c('c', 25)], 30);
    expect(rest).toEqual([]);
    expect(g?.targetId).toBe('c');
    expect(g?.mergedIds).toEqual(['a', 'b']);
    expect(g?.ids).toEqual(['a', 'b', 'c']);
    expect(g?.lastAt.getTime()).toBe(T0 + 25_000);
  });

  it('đúng ngưỡng (khoảng cách = cửa sổ) không gộp; < cửa sổ thì gộp', () => {
    expect(planMergeBurst([c('a', 0), c('b', 30)], 30)).toHaveLength(2);
    expect(planMergeBurst([c('a', 0), c('b', 29.999)], 30)).toHaveLength(1);
  });

  it('chuỗi nối tiếp: mỗi khoảng < cửa sổ dù tổng dài hơn cửa sổ', () => {
    expect(planMergeBurst([c('a', 0), c('b', 20), c('c', 40), c('d', 60)], 30)).toHaveLength(1);
  });

  it('khác khách hoặc khác bài → tách nhóm', () => {
    const groups = planMergeBurst(
      [c('a', 0), c('b', 5, { authorExternalId: 'u2' }), c('c', 6, { postId: 'p2' }), c('d', 7)],
      30,
    );
    expect(groups.map((g) => g.ids)).toEqual([['a', 'd'], ['b'], ['c']]);
  });

  it('khách không có mã → không gộp (mỗi bình luận một nhóm)', () => {
    const rows = [c('a', 0, { authorExternalId: '' }), c('b', 1, { authorExternalId: '' })];
    expect(planMergeBurst(rows, 30)).toHaveLength(2);
  });

  it('nhóm tối đa MAX_BURST_SIZE; phần dư sang nhóm mới', () => {
    const many = Array.from({ length: MAX_BURST_SIZE + 2 }, (_, i) =>
      c(`m${String(i).padStart(2, '0')}`, i),
    );
    expect(planMergeBurst(many, 30).map((g) => g.ids.length)).toEqual([MAX_BURST_SIZE, 2]);
  });

  it('cửa sổ ngoài khoảng được ép (5 → 10 giây)', () => {
    expect(planMergeBurst([c('a', 0), c('b', 9)], 5)).toHaveLength(1);
    expect(planMergeBurst([c('a', 0), c('b', 11)], 5)).toHaveLength(2);
  });

  it('không phụ thuộc thứ tự đầu vào; đồng thời gian xếp theo id; mỗi id đúng một nhóm', () => {
    const input = [c('d', 70), c('a', 0), c('c', 10), c('b', 10), c('e', 75)];
    const expected = planMergeBurst(input, 30).map((g) => g.ids);
    expect(expected).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
    for (let i = 0; i < input.length; i++) {
      const rotated = [...input.slice(i), ...input.slice(0, i)].reverse();
      expect(planMergeBurst(rotated, 30).map((g) => g.ids)).toEqual(expected);
    }
    expect(expected.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('bỏ mục trùng id, thời gian không hợp lệ; đầu vào rỗng → []', () => {
    expect(planMergeBurst([], 30)).toEqual([]);
    const groups = planMergeBurst(
      [c('a', 0), c('a', 1), c('x', 0, { createdAt: new Date('x') })],
      30,
    );
    expect(groups.map((g) => g.ids)).toEqual([['a']]);
  });

  it('nhận createdAt dạng số mili giây', () => {
    const groups = planMergeBurst(
      [c('a', 0, { createdAt: T0 }), c('b', 1, { createdAt: T0 + 1000 })],
      30,
    );
    expect(groups[0]?.ids).toEqual(['a', 'b']);
  });
});

describe('FR-148 isBurstReady / burstKey / mergeBurstText', () => {
  it('chỉ sẵn sàng khi now ≥ bình luận cuối + cửa sổ', () => {
    const [g] = planMergeBurst([c('a', 0), c('b', 10)], 30);
    if (!g) throw new Error('thiếu nhóm');
    expect(isBurstReady(g, T0 + 39_999, 30)).toBe(false);
    expect(isBurstReady(g, T0 + 40_000, 30)).toBe(true);
    expect(isBurstReady(g, new Date(T0 + 41_000), 30)).toBe(true);
  });

  it('burstKey chứa workspace_id + bài + khách, không nhập nhằng dấu phân cách', () => {
    const k = burstKey('w1', 'p1', 'u1');
    expect(k).toContain('w1');
    expect(burstKey('w2', 'p1', 'u1')).not.toBe(k);
    expect(burstKey('w1', 'p1:u', '1')).not.toBe(burstKey('w1', 'p1', 'u:1'));
  });

  it('mergeBurstText ghép theo thứ tự thời gian, bỏ phần rỗng', () => {
    const rows = [
      c('b', 5, { text: ' hai ' }),
      c('a', 0, { text: 'một' }),
      c('c', 8, { text: '  ' }),
    ];
    const [g] = planMergeBurst(rows, 30);
    if (!g) throw new Error('thiếu nhóm');
    expect(mergeBurstText(g)).toBe('một\nhai');
  });
});
