import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import {
  buildKbGapRecord,
  buildRetrievalLogRecord,
  KB_GAP_TOPICS,
  RETRIEVAL_MAX_CANDIDATES,
  RETRIEVAL_MAX_USED_CHUNKS,
  RETRIEVAL_TEXT_MAX_CHARS,
} from './retrieval-log';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

const baseLog = {
  query: 'size M còn không, ib 0912345678',
  lang: 'vi' as const,
  route: 'hybrid' as const,
  candidates: [{ chunkId: ID_A, vecRank: 1, ftsRank: 3, trgmRank: null, rerankScore: 0.82 }],
  usedChunkIds: [ID_A],
  resolvedProductIds: [ID_B],
  latencyMs: 120,
};

describe('FR-134 buildRetrievalLogRecord — bản ghi nhật ký tìm kiếm', () => {
  it('FR-134 che SĐT/email trong câu hỏi và search_query (nguyên tắc #6)', () => {
    const rec = buildRetrievalLogRecord({
      ...baseLog,
      searchQuery: 'liên hệ a@b.com về size M',
    });
    expect(rec.queryMasked).toBe('size M còn không, ib [sđt]');
    expect(rec.searchQueryMasked).toBe('liên hệ [email] về size M');
    expect(JSON.stringify(rec)).not.toMatch(/0912345678|a@b\.com/);
  });

  it('FR-134 search_query vắng → null; kb_version/draft/comment vắng → null', () => {
    const rec = buildRetrievalLogRecord(baseLog);
    expect(rec.searchQueryMasked).toBeNull();
    expect(rec.kbVersion).toBeNull();
    expect(rec.draftId).toBeNull();
    expect(rec.commentId).toBeNull();
  });

  it('FR-134 cắt văn bản dài đúng trần ký tự', () => {
    const rec = buildRetrievalLogRecord({ ...baseLog, query: 'a'.repeat(5000) });
    expect(rec.queryMasked).toHaveLength(RETRIEVAL_TEXT_MAX_CHARS);
  });

  it('FR-134 giữ điểm từng nhánh của ứng viên (hạng thiếu là null)', () => {
    const rec = buildRetrievalLogRecord(baseLog);
    expect(rec.candidates).toEqual([
      { chunk_id: ID_A, vec_rank: 1, fts_rank: 3, trgm_rank: null, rerank_score: 0.82 },
    ]);
  });

  it('FR-134 đúng 50 ứng viên được giữ, 51 bị từ chối', () => {
    const make = (n: number) =>
      Array.from({ length: n }, () => ({
        chunkId: ID_A,
        vecRank: 1,
        ftsRank: null,
        trgmRank: null,
        rerankScore: null,
      }));
    expect(
      buildRetrievalLogRecord({ ...baseLog, candidates: make(RETRIEVAL_MAX_CANDIDATES) })
        .candidates,
    ).toHaveLength(RETRIEVAL_MAX_CANDIDATES);
    expect(() =>
      buildRetrievalLogRecord({ ...baseLog, candidates: make(RETRIEVAL_MAX_CANDIDATES + 1) }),
    ).toThrow(AppError);
  });

  it('FR-134 loại id trùng; quá 20 đoạn đã dùng bị từ chối', () => {
    const rec = buildRetrievalLogRecord({
      ...baseLog,
      usedChunkIds: [ID_A, ID_A, ID_B],
      resolvedProductIds: [ID_B, ID_B],
    });
    expect(rec.usedChunkIds).toEqual([ID_A, ID_B]);
    expect(rec.resolvedProductIds).toEqual([ID_B]);
    const many = Array.from(
      { length: RETRIEVAL_MAX_USED_CHUNKS + 1 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(() => buildRetrievalLogRecord({ ...baseLog, usedChunkIds: many })).toThrow(AppError);
  });

  it('FR-134 / FR-136 route và lang lạ bị từ chối; sql, hybrid, both được nhận', () => {
    for (const route of ['sql', 'hybrid', 'both'] as const) {
      expect(buildRetrievalLogRecord({ ...baseLog, route }).route).toBe(route);
    }
    expect(() => buildRetrievalLogRecord({ ...baseLog, route: 'vector' as never })).toThrow(
      AppError,
    );
    expect(() => buildRetrievalLogRecord({ ...baseLog, lang: 'fr' as never })).toThrow(AppError);
  });

  it('FR-134 độ trễ âm/không nguyên/NaN bị từ chối; 0 được nhận; làm tròn không áp dụng', () => {
    expect(buildRetrievalLogRecord({ ...baseLog, latencyMs: 0 }).latencyMs).toBe(0);
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(() => buildRetrievalLogRecord({ ...baseLog, latencyMs: bad })).toThrow(AppError);
    }
  });

  it('FR-134 chunk id không phải UUID bị từ chối', () => {
    expect(() => buildRetrievalLogRecord({ ...baseLog, usedChunkIds: ['abc'] })).toThrow(AppError);
  });

  it('FR-134 câu hỏi rỗng bị từ chối', () => {
    expect(() => buildRetrievalLogRecord({ ...baseLog, query: '' })).toThrow(AppError);
  });
});

describe('FR-134 FR-141 buildKbGapRecord — câu hỏi AI chưa trả lời được', () => {
  it('FR-141 nhận đúng 7 chủ đề', () => {
    expect([...KB_GAP_TOPICS]).toEqual([
      'shipping',
      'discount',
      'product_info',
      'policy',
      'order_status',
      'size',
      'other',
    ]);
    for (const topic of KB_GAP_TOPICS) {
      expect(buildKbGapRecord({ topic, sampleQuestion: 'ship Cà Mau bao nhiêu' }).topic).toBe(
        topic,
      );
    }
  });

  it('FR-134 chủ đề lạ bị từ chối', () => {
    expect(() => buildKbGapRecord({ topic: 'weather' as never, sampleQuestion: 'x' })).toThrow(
      AppError,
    );
  });

  it('FR-134 che PII và cắt dài mẫu câu hỏi; sản phẩm vắng → null', () => {
    const rec = buildKbGapRecord({
      topic: 'size',
      sampleQuestion: `gọi 0912345678 ${'x'.repeat(2000)}`,
    });
    expect(rec.sampleQuestionMasked).toHaveLength(RETRIEVAL_TEXT_MAX_CHARS);
    expect(rec.sampleQuestionMasked.startsWith('gọi [sđt] ')).toBe(true);
    expect(rec.productId).toBeNull();
  });

  it('FR-134 giữ product_id hợp lệ; id lạ bị từ chối; câu hỏi rỗng bị từ chối', () => {
    expect(
      buildKbGapRecord({ topic: 'size', sampleQuestion: 'q', productId: ID_A }).productId,
    ).toBe(ID_A);
    expect(() =>
      buildKbGapRecord({ topic: 'size', sampleQuestion: 'q', productId: 'nope' }),
    ).toThrow(AppError);
    expect(() => buildKbGapRecord({ topic: 'size', sampleQuestion: '   ' })).toThrow(AppError);
  });
});
