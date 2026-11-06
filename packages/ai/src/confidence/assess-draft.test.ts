import { AppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { DraftResult } from '../draft/draft-result';
import { assessDraft, factSourcedRatio, readDraftOutcome } from './assess-draft';
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

const signals = {
  pLabel: 0.9,
  sProduct: 1,
  sRetrievalTop1: 0.8,
  sRetrievalTop2: 0.5,
  action: 'answer' as const,
  askedBefore: false,
};

describe('FR-163 factSourcedRatio — tỉ lệ ý fact có nguồn, tính bằng code', () => {
  it('mọi fact có nguồn → 1; một nửa → 0.5; ý không phải fact không tính', () => {
    expect(factSourcedRatio(draft)).toBe(1);
    const half: DraftResult = {
      ...draft,
      claims: [...draft.claims, { text: 'bảo hành 12 tháng', source_ids: [], kind: 'fact' }],
    };
    expect(factSourcedRatio(half)).toBeCloseTo(2 / 3, 9);
  });

  it('không có ý fact nào → 1 (không có gì để sai)', () => {
    expect(factSourcedRatio({ ...draft, claims: [] })).toBe(1);
    expect(
      factSourcedRatio({ ...draft, claims: [{ text: 'Dạ', source_ids: [], kind: 'greeting' }] }),
    ).toBe(1);
  });

  it('có tập nguồn cho phép → nguồn lạ không được tính là có nguồn', () => {
    expect(factSourcedRatio(draft, new Set(['kb:1']))).toBe(0.5);
    expect(factSourcedRatio(draft, new Set(['kb:1', 'kb:2']))).toBe(1);
    expect(factSourcedRatio(draft, new Set())).toBe(0);
  });
});

describe('FR-163 assessDraft — ghép bản nháp với tín hiệu', () => {
  it('bản nháp tốt → z = 4.3 như ca tính tay, ratio 1', () => {
    const result = assessDraft({ outcome: { ok: true, draft }, signals });
    expect(result.components?.fact_sourced_ratio).toBe(1);
    expect(result.components?.z).toBeCloseTo(4.3, 9);
    expect(result.needsHuman).toBe(false);
  });

  it('ratio do code tính từ claims, không nhận từ ngoài', () => {
    const tainted = { ...signals, factSourcedRatio: 0 } as typeof signals;
    const result = assessDraft({ outcome: { ok: true, draft }, signals: tainted });
    expect(result.components?.fact_sourced_ratio).toBe(1);
  });

  it('bản nháp needs_human → giữ cần người với lý do của bản nháp, điểm vẫn có để giải thích', () => {
    const handoff: DraftResult = { ...draft, reply: '', needs_human: true, reason: 'Thiếu nguồn' };
    const result = assessDraft({ outcome: { ok: true, draft: handoff }, signals });
    expect(result.needsHuman).toBe(true);
    expect(result.reason).toBe('Thiếu nguồn');
    expect(result.components).not.toBeNull();
  });

  it('hành động handoff → cần người dù bản nháp không đòi', () => {
    const result = assessDraft({
      outcome: { ok: true, draft },
      signals: { ...signals, action: 'handoff' },
    });
    expect(result.needsHuman).toBe(true);
  });

  it('tập nguồn cho phép được chuyển xuống factSourcedRatio', () => {
    const result = assessDraft({
      outcome: { ok: true, draft },
      signals,
      allowedSourceIds: new Set(['kb:1']),
    });
    expect(result.components?.fact_sourced_ratio).toBe(0.5);
  });
});

describe('FR-032 assessDraft — kết quả không đọc được → 0, chuyển người', () => {
  it('outcome lỗi → 0, không components', () => {
    const result = assessDraft({
      outcome: { ok: false, error: new AppError('LLM_UNAVAILABLE', 'hỏng') },
      signals,
    });
    expect(result).toEqual({
      confidence: 0,
      needsHuman: true,
      reason: REASON_UNREADABLE,
      components: null,
    });
  });

  it('tín hiệu lạ (hành động không biết) dù bản nháp đọc được → 0', () => {
    const result = assessDraft({
      outcome: { ok: true, draft },
      signals: { ...signals, action: 'reply' as unknown as 'answer' },
    });
    expect(result.confidence).toBe(0);
    expect(result.needsHuman).toBe(true);
  });

  it('readDraftOutcome: JSON hỏng → ok=false (không ném); JSON đúng → ok=true', () => {
    const bad = readDraftOutcome('không phải json');
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error('phải lỗi');
    expect(bad.error).toBeInstanceOf(AppError);

    const good = readDraftOutcome(
      JSON.stringify({ ...draft, claims: draft.claims, unanswered_topics: [] }),
    );
    expect(good.ok).toBe(true);
    if (!good.ok) throw new Error('phải đọc được');
    expect(good.draft.reply).toBe(draft.reply);
  });

  it('readDraftOutcome hỏng rồi assessDraft → 0 (đường đầy đủ của FR-032)', () => {
    const result = assessDraft({ outcome: readDraftOutcome('```json {"reply": '), signals });
    expect(result.confidence).toBe(0);
    expect(result.needsHuman).toBe(true);
    expect(result.reason).toBe(REASON_UNREADABLE);
  });
});
