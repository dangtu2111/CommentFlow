import { describe, expect, it } from 'vitest';
import {
  AUTO_SEND_THRESHOLD,
  type AutoSendPreviewInput,
  decideAutoSendPreview,
} from './auto-send-preview';

const ok: AutoSendPreviewInput = {
  autoSendEnabled: true,
  decision: { action: 'answer', needsHuman: false, autoSendPolicy: 'standard' },
  draft: { needs_human: false, reply: 'Áo giá 150.000đ ạ', claims: [{ kind: 'fact' }] },
  confidence: { confidence: 0.95, needsHuman: false },
  guardOk: true,
};

describe('FR-059 US-034 decideAutoSendPreview (chỉ hiển thị, không phải cổng thật)', () => {
  it('đủ điều kiện → allowed, không lý do chặn', () => {
    expect(decideAutoSendPreview(ok)).toEqual({ allowed: true, reasons: [] });
  });

  it('Owner chưa bật tự gửi → chặn auto_send_off', () => {
    const r = decideAutoSendPreview({ ...ok, autoSendEnabled: false });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain('auto_send_off');
  });

  it('quyết định cần người / policy never → chặn', () => {
    const r = decideAutoSendPreview({
      ...ok,
      decision: { action: 'handoff', needsHuman: true, autoSendPolicy: 'never' },
    });
    expect(r.reasons).toContain('needs_human');
    expect(r.reasons).toContain('policy_never');
  });

  it('bản nháp đề nghị chuyển người → chặn', () => {
    const r = decideAutoSendPreview({ ...ok, draft: { ...ok.draft, needs_human: true } });
    expect(r.reasons).toContain('needs_human');
  });

  it('độ tin cậy dưới ngưỡng 0,85 → chặn; đúng ngưỡng → qua', () => {
    expect(AUTO_SEND_THRESHOLD).toBe(0.85);
    const below = decideAutoSendPreview({
      ...ok,
      confidence: { confidence: 0.849, needsHuman: false },
    });
    expect(below.reasons).toContain('low_confidence');
    const at = decideAutoSendPreview({
      ...ok,
      confidence: { confidence: 0.85, needsHuman: false },
    });
    expect(at.allowed).toBe(true);
  });

  it('độ tin cậy báo cần người (không đọc được) → chặn', () => {
    const r = decideAutoSendPreview({ ...ok, confidence: { confidence: 0, needsHuman: true } });
    expect(r.reasons).toContain('needs_human');
  });

  it('guard số tiền không đạt → chặn guard_money', () => {
    const r = decideAutoSendPreview({ ...ok, guardOk: false });
    expect(r.reasons).toContain('guard_money');
  });

  it('câu rỗng → chặn empty_reply', () => {
    const r = decideAutoSendPreview({ ...ok, draft: { ...ok.draft, reply: '' } });
    expect(r.reasons).toContain('empty_reply');
  });

  it('clarify chỉ-câu-hỏi với allow_clarify vẫn cho phép; có ý fact thì nâng thành allow_partial (vẫn cho phép)', () => {
    const r = decideAutoSendPreview({
      ...ok,
      decision: { action: 'clarify', needsHuman: false, autoSendPolicy: 'allow_clarify' },
      draft: {
        needs_human: false,
        reply: 'Bạn chọn size nào ạ?',
        claims: [{ kind: 'question_back' }],
      },
    });
    expect(r.allowed).toBe(true);
  });
});
