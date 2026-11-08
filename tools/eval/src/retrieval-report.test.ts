import { describe, expect, it } from 'vitest';
import { stableId } from './production/seed';
import {
  buildOriginMap,
  explainMiss,
  originOf,
  type QuestionDiagnostic,
  renderRetrievalReport,
} from './retrieval-report';

const shop = {
  id: 'shop-x',
  texts: [
    { id: 'policy:aaa', kind: 'policy' as const },
    { id: 'faq-1', kind: 'faq' as const },
  ],
  products: [{ id: 'prod-1' }],
};

describe('originOf — chunk_key → mã mục trong shop file', () => {
  const map = buildOriginMap(shop);
  it('chính sách / FAQ / sản phẩm đều quy về mã gốc, bỏ phần mục và số đoạn', () => {
    const p = stableId('shop-x', 'policy', 'policy:aaa');
    const f = stableId('shop-x', 'faq', 'faq-1');
    const pr = stableId('shop-x', 'product', 'prod-1');
    expect(originOf(`policy:${p}:2#0`, map)).toBe('policy:aaa');
    expect(originOf(`faq:${f}#1`, map)).toBe('faq-1');
    expect(originOf(`product:${pr}#0`, map)).toBe('prod-1');
  });
  it('khóa lạ (thông tin shop…) → chính khóa gốc để vẫn hiển thị', () => {
    expect(originOf('shop:vi#0', map)).toBe('shop:vi');
  });
});

const base: QuestionDiagnostic = {
  id: 's1',
  group: 'en',
  text: 'how long does shipping take',
  gold: ['ship'],
  rank: null,
  top: [],
  relevanceFloor: 0.25,
  goldOutsideTopWithOtherLang: false,
};

describe('explainMiss — lý do đoạn đúng không vào top', () => {
  it('có đoạn đúng ở lang khác → bị lọc theo lang', () => {
    expect(explainMiss({ ...base, goldOutsideTopWithOtherLang: true })).toMatch(/lang/i);
  });

  it('đúng nhưng ngoài top-5 → xếp hạng thấp, nêu hạng', () => {
    expect(explainMiss({ ...base, rank: 8 })).toMatch(/hạng 8/);
  });

  it('không có đoạn nào ở bất kỳ nhánh → không nhánh nào bắt được', () => {
    expect(explainMiss(base)).toMatch(/không nhánh nào/i);
  });

  it('đúng trong top-5 nhưng điểm liên quan dưới ngưỡng → bị loại bởi ngưỡng', () => {
    const d: QuestionDiagnostic = {
      ...base,
      rank: 2,
      top: [
        {
          origin: 'x',
          chunkKey: 'a',
          rrf: 0.03,
          relevance: 0.5,
          vector: null,
          text: null,
          trigram: null,
          isGold: false,
        },
        {
          origin: 'ship',
          chunkKey: 'b',
          rrf: 0.005,
          relevance: 0.1,
          vector: null,
          text: null,
          trigram: null,
          isGold: true,
        },
      ],
    };
    expect(explainMiss(d)).toMatch(/ngưỡng/);
  });
});

describe('renderRetrievalReport', () => {
  it('ghi cấu hình (embedder, kb_version), bảng recall@5/MRR theo nhóm, phán quyết và từng câu trượt kèm top-5', () => {
    const md = renderRetrievalReport({
      title: 'Truy hồi demo',
      config: { Embedder: 'bge-m3', kb_version: '3' },
      metrics: {
        all: { samples: 2, recallAtK: 0.5, mrr: 0.5 },
        en: { samples: 2, recallAtK: 0.5, mrr: 0.5 },
      },
      failures: [
        {
          ...base,
          top: [
            {
              origin: 'refund',
              chunkKey: 'policy:x:0#0',
              rrf: 0.0164,
              relevance: 0.33,
              vector: { rank: 1, distance: 0.4 },
              text: null,
              trigram: { rank: 2, wordSimilarity: 0.45 },
              isGold: false,
            },
          ],
        },
      ],
    });
    expect(md).toContain('Embedder');
    expect(md).toContain('kb_version');
    expect(md).toMatch(/recall@5[^\n]*50\.0%/);
    expect(md).toContain('❌');
    expect(md).toContain('s1');
    expect(md).toContain('refund');
    expect(md).toMatch(/vector #1/);
    expect(md).toMatch(/trigram #2/);
  });

  it('không có câu trượt → ghi rõ', () => {
    const md = renderRetrievalReport({
      title: 'T',
      config: {},
      metrics: { all: { samples: 1, recallAtK: 1, mrr: 1 } },
      failures: [],
    });
    expect(md).toMatch(/không có câu trượt/i);
  });
});
