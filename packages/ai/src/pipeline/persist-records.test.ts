import { describe, expect, it } from 'vitest';
import { FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import {
  commentUpdateOf,
  HANDOFF_PLACEHOLDER_TEXT,
  handoffDraftInput,
  toDraftInput,
  toGapInputs,
  toRetrievalInput,
} from './persist-records';
import type { PipelineResult } from './run-pipeline';

const COMMENT = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const CHUNK = '33333333-3333-4333-8333-333333333333';
const CTX = {
  commentId: COMMENT,
  kbVersionNumber: 4,
  model: 'cf-draft',
  promptVersion: 'draft@5',
  traceId: 'trace-1',
};

type Done = Extract<PipelineResult, { status: 'done' }>;

const done = (over: Partial<Done> = {}): Done =>
  ({
    status: 'done',
    billed: false,
    maskedText: 'Áo thun giá bao nhiêu, sđt [sđt]',
    normalizedText: 'áo thun giá bao nhiêu sđt [sđt]',
    resolvedProductIds: [PRODUCT],
    conversationState: { productIds: [PRODUCT], pendingAsks: ['giá'] },
    extract: {
      ...FIXTURE_EXTRACT_DEFAULT,
      labels: [{ label: 'price' }],
      asks: ['giá'],
      product_mentions: ['áo thun'],
    },
    thread: { clarifyCount: 0, repeatCount: 0, humanHolding: false },
    searchQuery: 'áo thun giá',
    rewriteSource: null,
    lang: 'vi',
    label: 'price',
    labels: [{ label: 'price' }],
    route: 'both',
    routeReason: 'x',
    decision: {
      action: 'answer',
      reason: 'all_sourced',
      needsHuman: false,
      needsSupportTag: false,
      clarify: null,
      answeredTopics: ['product_info'],
      unansweredTopics: [],
      redirectTemplates: [],
      autoSendPolicy: 'standard',
      askedBefore: false,
    },
    riskReasons: { legal: [], injection: [], impersonation: [] },
    reply: 'Dạ áo thun giá 150.000đ ạ',
    variants: ['Áo thun giá 150.000đ nha bạn'],
    draft: {
      reply: 'Dạ áo thun giá 150.000đ ạ',
      lang: 'vi',
      sources: [PRODUCT],
      claims: [{ text: 'Giá 150.000đ', source_ids: [PRODUCT], kind: 'fact' }],
      unanswered_topics: [],
      needs_human: false,
      reason: '',
      variants: ['Áo thun giá 150.000đ nha bạn'],
    },
    candidates: [
      {
        id: PRODUCT,
        kind: 'product',
        title: 'Áo thun',
        text: 'Áo thun: giá 150.000đ' as never,
        score: 1,
        topics: ['product_info'],
        used: true,
        priceSources: [
          {
            productId: PRODUCT,
            variantId: null,
            priceVnd: 150000,
            stock: 5,
            updatedFromSourceAt: new Date('2026-11-01T03:00:00Z'),
          },
        ],
      },
      {
        id: `kb:${CHUNK}`,
        kind: 'kb',
        title: 'Ship',
        text: 'Phí ship 20.000đ' as never,
        score: 0.8,
        topics: ['shipping'],
        used: false,
      },
      {
        id: 'policy.1',
        kind: 'policy',
        title: 'Đổi trả',
        text: 'Đổi trả 7 ngày' as never,
        score: 0.5,
        topics: ['policy'],
        used: false,
      },
    ],
    confidence: { confidence: 0.93, needsHuman: false, reason: null, components: null },
    guard: { ok: true, violations: [], replyViolations: [] },
    autoSend: { allowed: false, reasons: ['auto_send_off'] },
    ...over,
  }) as Done;

describe('toDraftInput — kết quả pipeline → bản ghi `drafts`', () => {
  it('đủ trường; ảnh chụp giá chỉ từ nguồn ĐÃ DÙNG; nguồn là id; kbVersion/model/promptVersion/traceId theo ngữ cảnh', () => {
    const d = toDraftInput(done(), CTX);
    expect(d).toMatchObject({
      targetType: 'comment',
      targetId: COMMENT,
      text: 'Dạ áo thun giá 150.000đ ạ',
      lang: 'vi',
      sources: [PRODUCT],
      confidence: 0.93,
      needsHuman: false,
      reason: 'all_sourced',
      model: 'cf-draft',
      promptVersion: 'draft@5',
      kbVersion: 4,
      action: 'answer',
      variants: ['Áo thun giá 150.000đ nha bạn'],
      unansweredTopics: [],
      traceId: 'trace-1',
    });
    expect(d.priceSnapshot).toEqual([
      {
        product_id: PRODUCT,
        variant_id: null,
        price_vnd: 150000,
        stock: 5,
        updated_from_source_at: '2026-11-01T03:00:00.000Z',
      },
    ]);
    expect(d.extracted).toMatchObject({ asks: ['giá'] });
    // Trạng thái hội thoại có cấu trúc cho lượt sau (Q-POR12).
    expect(d.contextRefs).toContainEqual({
      type: 'state',
      productIds: [PRODUCT],
      pendingAsks: ['giá'],
    });
  });

  it('cần người (do quyết định/bản nháp/độ tin cậy) → needsHuman; câu trống → câu giữ chỗ; ngôn ngữ lạ → vi', () => {
    const handoff = done({
      lang: 'other',
      reply: '   ',
      decision: { ...done().decision, action: 'handoff', reason: 'lang_other', needsHuman: true },
    });
    const d = toDraftInput(handoff, CTX);
    expect(d).toMatchObject({
      needsHuman: true,
      lang: 'vi',
      action: 'handoff',
      text: HANDOFF_PLACEHOLDER_TEXT,
      reason: 'lang_other',
    });
    expect(
      toDraftInput(
        done({
          confidence: { confidence: 0.2, needsHuman: true, reason: 'low', components: null },
        }),
        CTX,
      ).needsHuman,
    ).toBe(true);
    expect(
      toDraftInput(done({ draft: { ...done().draft, needs_human: true } }), CTX).needsHuman,
    ).toBe(true);
  });

  it('không có nguồn dùng/giá ngoại tệ → ảnh chụp giá rỗng; kbVersion null được giữ', () => {
    const noPrice = done({ candidates: done().candidates.map((c) => ({ ...c, used: false })) });
    expect(toDraftInput(noPrice, { ...CTX, kbVersionNumber: null })).toMatchObject({
      priceSnapshot: [],
      kbVersion: null,
    });
  });
});

describe('toRetrievalInput — nhật ký tìm kiếm (chỉ id dạng uuid; truy vấn do builder che PII)', () => {
  it('route, kbVersion, đoạn đã dùng (uuid), sản phẩm nhận ra; ứng viên không phải uuid (chính sách…) bị bỏ', () => {
    const r = toRetrievalInput(
      done({
        candidates: done().candidates.map((c) =>
          c.id === `kb:${CHUNK}` ? { ...c, used: true } : c,
        ),
      }),
      CTX,
      12,
    );
    expect(r).toMatchObject({
      query: 'Áo thun giá bao nhiêu, sđt [sđt]',
      searchQuery: 'áo thun giá',
      lang: 'vi',
      route: 'both',
      kbVersion: 4,
      commentId: COMMENT,
      latencyMs: 12,
      usedChunkIds: [CHUNK],
      resolvedProductIds: [PRODUCT],
    });
    expect(r.candidates.map((c) => c.chunkId)).toEqual([CHUNK]);
  });

  it('ngôn ngữ lạ → vi; thiếu searchQuery → bỏ', () => {
    const r = toRetrievalInput(done({ lang: 'other', searchQuery: undefined }), CTX, 0);
    expect(r.lang).toBe('vi');
    expect(r.searchQuery).toBeUndefined();
  });
});

describe('toGapInputs — một lỗ hổng cho mỗi chủ đề chưa có nguồn', () => {
  it('mỗi chủ đề thiếu một mục; có đúng một sản phẩm nhận ra thì gắn sản phẩm; không có chủ đề → rỗng', () => {
    const gaps = toGapInputs(
      done({ decision: { ...done().decision, unansweredTopics: ['shipping', 'policy'] } }),
    );
    expect(gaps).toEqual([
      { topic: 'shipping', sampleQuestion: 'Áo thun giá bao nhiêu, sđt [sđt]', productId: PRODUCT },
      { topic: 'policy', sampleQuestion: 'Áo thun giá bao nhiêu, sđt [sđt]', productId: PRODUCT },
    ]);
    expect(toGapInputs(done())).toEqual([]);
  });

  it('nhiều sản phẩm hoặc không có sản phẩm → không gắn sản phẩm', () => {
    const none = toGapInputs(
      done({ candidates: [], decision: { ...done().decision, unansweredTopics: ['other'] } }),
    );
    expect(none).toEqual([
      { topic: 'other', sampleQuestion: 'Áo thun giá bao nhiêu, sđt [sđt]', productId: null },
    ]);
  });
});

describe('toGapInputs — KB-GAPS-FROM-HANDOFF', () => {
  const Q = 'Áo thun giá bao nhiêu, sđt [sđt]';
  const handoff = {
    ...done().decision,
    action: 'handoff' as const,
    reason: 'claim_unsupported' as const,
  };

  it('chuyển người vì claim_unsupported → một gap theo chủ đề của sự kiện/ý hỏi (cờ tắt cũng vậy)', () => {
    const gaps = toGapInputs(
      done({ decision: handoff, gapTopics: { plan: [], fallback: ['policy'] } }),
    );
    expect(gaps).toEqual([{ topic: 'policy', sampleQuestion: Q, productId: PRODUCT }]);
  });

  it('câu dự phòng do code dựng (slotDiagnostics.chosen = fallback) → gap; chọn reply thì không', () => {
    const base = { rawTexts: 1, rejected: 1 };
    const gaps = toGapInputs(
      done({
        slotDiagnostics: { ...base, chosen: 'fallback' },
        gapTopics: { plan: [], fallback: ['shipping'] },
      }),
    );
    expect(gaps.map((g) => g.topic)).toEqual(['shipping']);
    expect(
      toGapInputs(
        done({
          slotDiagnostics: { ...base, chosen: 'reply' },
          gapTopics: { plan: [], fallback: ['shipping'] },
        }),
      ),
    ).toEqual([]);
  });

  it('plan.unknownTopics → gap kể cả khi trả lời bình thường; trùng chủ đề với unansweredTopics chỉ một gap', () => {
    const gaps = toGapInputs(
      done({
        decision: { ...done().decision, unansweredTopics: ['policy'] },
        gapTopics: { plan: ['policy', 'shipping'], fallback: [] },
      }),
    );
    expect(gaps.map((g) => g.topic)).toEqual(['policy', 'shipping']);
  });
});

describe('commentUpdateOf — cập nhật bình luận sau khi soạn', () => {
  it('trả lời/hỏi lại/chuyển hướng → pending_review; chuyển người hoặc cần người → needs_human; nhãn, ngôn ngữ, chuẩn hóa, theo dõi', () => {
    expect(commentUpdateOf(done())).toMatchObject({
      status: 'pending_review',
      label: 'price',
      lang: 'vi',
      textNormalized: 'áo thun giá bao nhiêu sđt [sđt]',
      needsFollowup: false,
      followupTopics: [],
    });
    const hand = commentUpdateOf(
      done({
        decision: {
          ...done().decision,
          action: 'handoff',
          needsHuman: true,
          unansweredTopics: ['shipping'],
        },
      }),
    );
    expect(hand).toMatchObject({
      status: 'needs_human',
      needsFollowup: true,
      followupTopics: ['shipping'],
    });
    expect(
      commentUpdateOf(
        done({ confidence: { confidence: 0.1, needsHuman: true, reason: 'x', components: null } }),
      ).status,
    ).toBe('needs_human');
  });

  it('ngôn ngữ lạ → lang null', () => {
    expect(commentUpdateOf(done({ lang: 'other' })).lang).toBeNull();
  });
});

describe('handoffDraftInput — bản nháp "Cần nhân viên" cho lượt bị chặn/lỗi', () => {
  it('needs_human, action handoff, lý do rõ, không nguồn/giá', () => {
    const d = handoffDraftInput('quota_exhausted', CTX);
    expect(d).toMatchObject({
      targetType: 'comment',
      targetId: COMMENT,
      text: HANDOFF_PLACEHOLDER_TEXT,
      lang: 'vi',
      needsHuman: true,
      action: 'handoff',
      reason: 'quota_exhausted',
      priceSnapshot: [],
      sources: [],
      kbVersion: 4,
    });
  });
});
