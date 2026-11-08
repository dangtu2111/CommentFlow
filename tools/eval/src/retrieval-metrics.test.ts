import { describe, expect, it } from 'vitest';
import {
  aggregateRetrieval,
  calibrateThreshold,
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

describe('calibrateThreshold — chọn ngưỡng cosine theo dữ liệu (F1)', () => {
  it('tách được hoàn toàn → ngưỡng nằm giữa hai nhóm, F1 = 1', () => {
    const r = calibrateThreshold([0.62, 0.7, 0.55], [0.3, 0.4, 0.35]);
    expect(r.f1).toBe(1);
    expect(r.threshold).toBeGreaterThan(0.4);
    expect(r.threshold).toBeLessThanOrEqual(0.55);
    expect(r.recall).toBe(1);
    expect(r.falseAcceptRate).toBe(0);
  });

  it('chồng lấn → chọn ngưỡng F1 lớn nhất, báo recall và tỉ lệ nhận nhầm tại ngưỡng đó', () => {
    const r = calibrateThreshold([0.5, 0.6, 0.7, 0.45], [0.48, 0.3, 0.2]);
    expect(r.f1).toBeGreaterThan(0.8);
    expect(r.positives).toBe(4);
    expect(r.negatives).toBe(3);
    expect(r.curve.length).toBeGreaterThanOrEqual(5);
  });

  it('F1 hòa → lấy ngưỡng THẤP nhất (ưu tiên recall: không bỏ sót đoạn đúng)', () => {
    const r = calibrateThreshold([0.6, 0.6], [0.2, 0.2]);
    expect(r.recall).toBe(1);
    expect(r.threshold).toBeLessThanOrEqual(0.6);
  });

  it('không có mẫu dương → lỗi rõ (không thể hiệu chỉnh)', () => {
    expect(() => calibrateThreshold([], [0.3])).toThrow(/dương/);
  });

  it('thang điểm rất nhỏ (rerank 0,0001–0,2) vẫn hiệu chỉnh được — không dùng lưới cố định 0,01', () => {
    const r = calibrateThreshold([0.19, 0.08, 0.03], [0.004, 0.0006]);
    expect(r.f1).toBe(1);
    expect(r.threshold).toBeGreaterThan(0.004);
    expect(r.threshold).toBeLessThanOrEqual(0.03);
  });
});
