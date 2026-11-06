import { AppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { DraftResult } from '../draft/draft-result';
import {
  type AssessDraftInput,
  assessDraft,
  factSourcedRatio,
  REASON_DRAFT_NEEDS_HUMAN,
  readDraftOutcome,
} from './assess-draft';
import { REASON_UNREADABLE } from './confidence';

const draft: DraftResult = {
  reply: 'Dạ áo này giá 199.000đ, giao 2–3 ngày ạ.',
  lang: 'vi',
  sources: ['kb:1', 'kb:2'],
  claims: [
    { text: 'giá 199.000đ', source_ids: ['kb:1'], kind: 'fact' },
    { text: 'giao 2–3 ngày', source_ids: ['kb:2'], kind: 'fact' },
    { text: 'Dạ', source_ids: [], kind: 'greeting' },
  ],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
};

const allowed = new Set(['kb:1', 'kb:2']);

const signals = {
  pLabel: 0.9,
  sProduct: 1,
  sRetrievalTop1: 0.8,
  sRetrievalTop2: 0.5,
  action: 'answer' as const,
  askedBefore: false,
};

const zero = { confidence: 0, needsHuman: true, reason: REASON_UNREADABLE, components: null };

describe('FR-163 factSourcedRatio — tỉ lệ ý fact có nguồn, tính bằng code', () => {
  it('mọi fact có nguồn → 1; một trong ba thiếu → 2/3; ý không phải fact không tính', () => {
    expect(factSourcedRatio(draft, allowed, 'answer')).toBe(1);
    const half: DraftResult = {
      ...draft,
      claims: [...draft.claims, { text: 'bảo hành 12 tháng', source_ids: [], kind: 'fact' }],
    };
    expect(factSourcedRatio(half, allowed, 'answer')).toBeCloseTo(2 / 3, 9);
  });

  it('câu answer có nội dung mà AI không khai ý fact nào → 0 (AI không tự nâng điểm bằng cách bỏ fact)', () => {
    expect(factSourcedRatio({ ...draft, claims: [] }, allowed, 'answer')).toBe(0);
    expect(
      factSourcedRatio(
        { ...draft, claims: [{ text: 'Dạ', source_ids: [], kind: 'greeting' }] },
        allowed,
        'answer',
      ),
    ).toBe(0);
  });

  it('không fact nhưng là clarify/redirect/handoff hoặc câu rỗng → 1 (không có gì để sai)', () => {
    const noFact = { ...draft, claims: [] };
    expect(factSourcedRatio(noFact, allowed, 'clarify')).toBe(1);
    expect(factSourcedRatio(noFact, allowed, 'redirect')).toBe(1);
    expect(factSourcedRatio(noFact, allowed, 'handoff')).toBe(1);
    expect(factSourcedRatio({ ...noFact, reply: '' }, allowed, 'answer')).toBe(1);
  });

  it('nguồn ngoài tập cho phép (AI bịa id) không được tính là có nguồn', () => {
    expect(factSourcedRatio(draft, new Set(['kb:1']), 'answer')).toBe(0.5);
    expect(factSourcedRatio(draft, new Set(), 'answer')).toBe(0);
    const fake: DraftResult = {
      ...draft,
      claims: [{ text: 'giá 1đ', source_ids: ['kb:999'], kind: 'fact' }],
    };
    expect(factSourcedRatio(fake, allowed, 'answer')).toBe(0);
  });
});

describe('FR-163 assessDraft — ghép bản nháp với tín hiệu', () => {
  const base: AssessDraftInput = {
    outcome: { ok: true, draft },
    signals,
    allowedSourceIds: allowed,
  };

  it('bản nháp tốt → z = 4.3 như ca tính tay, ratio 1', () => {
    const result = assessDraft(base);
    expect(result.components?.fact_sourced_ratio).toBe(1);
    expect(result.components?.z).toBeCloseTo(4.3, 9);
    expect(result.needsHuman).toBe(false);
  });

  it('ratio do code tính từ claims, không nhận từ ngoài', () => {
    const tainted = { ...signals, factSourcedRatio: 0 } as typeof signals;
    const result = assessDraft({ ...base, signals: tainted });
    expect(result.components?.fact_sourced_ratio).toBe(1);
  });

  it('bản nháp needs_human → cần người với lý do cố định (không chép chữ tự do của AI)', () => {
    const handoff: DraftResult = {
      ...draft,
      reply: '',
      needs_human: true,
      reason: 'Khách 0912 345 678 đòi gặp quản lý',
    };
    const result = assessDraft({ ...base, outcome: { ok: true, draft: handoff } });
    expect(result.needsHuman).toBe(true);
    expect(result.reason).toBe(REASON_DRAFT_NEEDS_HUMAN);
    expect(result.reason).not.toContain('0912');
    expect(result.components).not.toBeNull();
  });

  it('hành động handoff → cần người dù bản nháp không đòi', () => {
    const result = assessDraft({ ...base, signals: { ...signals, action: 'handoff' } });
    expect(result.needsHuman).toBe(true);
  });

  it('tập nguồn cho phép được chuyển xuống factSourcedRatio', () => {
    const result = assessDraft({ ...base, allowedSourceIds: new Set(['kb:1']) });
    expect(result.components?.fact_sourced_ratio).toBe(0.5);
  });
});

describe('FR-032 assessDraft — kết quả không đọc được → 0, chuyển người', () => {
  it('outcome lỗi → 0, không components', () => {
    const result = assessDraft({
      outcome: { ok: false, error: new AppError('LLM_UNAVAILABLE', 'hỏng') },
      signals,
      allowedSourceIds: allowed,
    });
    expect(result).toEqual(zero);
  });

  it('tín hiệu lạ (hành động không biết) dù bản nháp đọc được → 0', () => {
    const result = assessDraft({
      outcome: { ok: true, draft },
      signals: { ...signals, action: 'reply' as unknown as 'answer' },
      allowedSourceIds: allowed,
    });
    expect(result).toEqual(zero);
  });

  it.each([
    ['outcome ok nhưng draft thiếu claims', { ok: true, draft: { reply: 'x' } }],
    ['outcome null', null],
    [
      'claims có phần tử không có source_ids',
      { ok: true, draft: { ...draft, claims: [{ kind: 'fact' }] } },
    ],
  ])('dữ liệu sai dạng lúc chạy (%s) → 0, không ném', (_name, outcome) => {
    const result = assessDraft({
      outcome: outcome as unknown as AssessDraftInput['outcome'],
      signals,
      allowedSourceIds: allowed,
    });
    expect(result).toEqual(zero);
  });

  it('readDraftOutcome: JSON hỏng → ok=false (không ném); JSON đúng → ok=true', () => {
    const bad = readDraftOutcome('không phải json');
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error('phải lỗi');
    expect(bad.error).toBeInstanceOf(AppError);

    const good = readDraftOutcome(JSON.stringify(draft));
    expect(good.ok).toBe(true);
    if (!good.ok) throw new Error('phải đọc được');
    expect(good.draft.reply).toBe(draft.reply);
  });

  it('readDraftOutcome hỏng rồi assessDraft → 0 (đường đầy đủ của FR-032)', () => {
    const result = assessDraft({
      outcome: readDraftOutcome('```json {"reply": '),
      signals,
      allowedSourceIds: allowed,
    });
    expect(result).toEqual(zero);
  });
});
