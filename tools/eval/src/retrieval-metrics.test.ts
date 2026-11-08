import { describe, expect, it } from 'vitest';
import {
  aggregateRetrieval,
  firstHitRank,
  judgeRetrieval,
  parseRetrievalGold,
  RETRIEVAL_THRESHOLDS,
} from './retrieval-metrics';

describe('firstHitRank', () => {
  it('hạng (từ 1) của đoạn đúng đầu tiên trong danh sách; không có → null', () => {
    expect(firstHitRank(['a', 'b', 'c'], new Set(['b', 'c']))).toBe(2);
    expect(firstHitRank(['a', 'b'], new Set(['x']))).toBeNull();
    expect(firstHitRank([], new Set(['x']))).toBeNull();
  });
});

describe('aggregateRetrieval — recall@k và MRR', () => {
  const rows = [
    { id: 's1', group: 'vi' as const, rank: 1 },
    { id: 's2', group: 'vi' as const, rank: 3 },
    { id: 's3', group: 'vi' as const, rank: 7 },
    { id: 's4', group: 'vi' as const, rank: null },
    { id: 's5', group: 'en' as const, rank: 2 },
  ];

  it('recall@5 = tỉ lệ mẫu có đoạn đúng trong top-5; MRR = trung bình 1/hạng (không có = 0)', () => {
    const m = aggregateRetrieval(rows, 5);
    expect(m.vi?.samples).toBe(4);
    expect(m.vi?.recallAtK).toBeCloseTo(2 / 4);
    expect(m.vi?.mrr).toBeCloseTo((1 + 1 / 3 + 1 / 7 + 0) / 4);
    expect(m.en).toMatchObject({ samples: 1, recallAtK: 1 });
    expect(m.en?.mrr).toBeCloseTo(0.5);
  });

  it('có nhóm "all" gộp mọi mẫu; nhóm không có mẫu bị bỏ', () => {
    const m = aggregateRetrieval(rows, 5);
    expect(m.all.samples).toBe(5);
    expect(m.all.recallAtK).toBeCloseTo(3 / 5);
    expect('mixed' in m).toBe(false);
  });

  it('danh sách rỗng → chỉ nhóm all với 0 mẫu và tỉ lệ null', () => {
    const m = aggregateRetrieval([], 5);
    expect(m.all).toMatchObject({ samples: 0, recallAtK: null, mrr: null });
  });
});

describe('judgeRetrieval — mục tiêu recall@5 ≥ 0,9 và MRR ≥ 0,7', () => {
  it('đạt khi cả hai đủ ngưỡng; trượt từng chỉ số riêng', () => {
    expect(RETRIEVAL_THRESHOLDS).toEqual({ recallAtK: 0.9, mrr: 0.7, k: 5 });
    const ok = judgeRetrieval({ samples: 10, recallAtK: 0.95, mrr: 0.8 });
    expect(ok.map((v) => v.pass)).toEqual([true, true]);
    const bad = judgeRetrieval({ samples: 10, recallAtK: 0.8, mrr: 0.75 });
    expect(bad.map((v) => v.pass)).toEqual([false, true]);
    expect(judgeRetrieval({ samples: 0, recallAtK: null, mrr: null }).map((v) => v.pass)).toEqual([
      null,
      null,
    ]);
  });
});

describe('parseRetrievalGold — tệp gán đoạn đúng', () => {
  it('mỗi dòng JSON: mã mẫu + danh sách mã mục kiến thức đúng (shop text id hoặc product id)', () => {
    const gold = parseRetrievalGold(
      '{"id":"s1","gold":["ship-time"]}\n\n{"id":"s2","gold":["ret-1","faq-2"]}\n',
    );
    expect(gold.get('s1')).toEqual(new Set(['ship-time']));
    expect(gold.get('s2')).toEqual(new Set(['ret-1', 'faq-2']));
  });

  it('dòng hỏng / thiếu gold / trùng mã mẫu → lỗi rõ', () => {
    expect(() => parseRetrievalGold('không phải json')).toThrow(/dòng 1/);
    expect(() => parseRetrievalGold('{"id":"s1"}')).toThrow(/gold/);
    expect(() => parseRetrievalGold('{"id":"s1","gold":[]}')).toThrow(/gold/);
    expect(() => parseRetrievalGold('{"id":"s1","gold":["a"]}\n{"id":"s1","gold":["b"]}')).toThrow(
      /trùng/,
    );
  });
});
