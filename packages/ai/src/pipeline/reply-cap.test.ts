import { describe, expect, it } from 'vitest';
import { clampMaxAiReplies, evaluateReplyCap, replyCapClosingDecision } from './reply-cap';

describe('FR-167 — trần trả lời theo (khách, bài)', () => {
  it('trần 3: câu 1–2 bình thường, câu 3 là câu CHỐT, câu 4+ vượt trần', () => {
    const verdicts = [0, 1, 2, 3, 4, 5].map((count) => evaluateReplyCap({ count, max: 3 }));
    expect(verdicts).toEqual(['ok', 'ok', 'closing', 'exceeded', 'exceeded', 'exceeded']);
  });

  it('trần 1: câu đầu đã là câu chốt; trần 5: câu 5 là câu chốt', () => {
    expect(evaluateReplyCap({ count: 0, max: 1 })).toBe('closing');
    expect(evaluateReplyCap({ count: 1, max: 1 })).toBe('exceeded');
    expect(evaluateReplyCap({ count: 3, max: 5 })).toBe('ok');
    expect(evaluateReplyCap({ count: 4, max: 5 })).toBe('closing');
  });

  it('ngưỡng hỏng (ngoài 1–5, không nguyên, null) → mặc định 3; số đếm lạ → 0', () => {
    for (const bad of [0, 6, -1, 2.5, Number.NaN, null, undefined]) {
      expect(clampMaxAiReplies(bad as number)).toBe(3);
    }
    expect(clampMaxAiReplies(4)).toBe(4);
    expect(evaluateReplyCap({ count: Number.NaN, max: 3 })).toBe('ok');
    expect(evaluateReplyCap({ count: -3, max: 3 })).toBe('ok');
    expect(evaluateReplyCap({ count: 2.9, max: 3 })).toBe('closing');
  });

  it('câu chốt: redirect mời nhắn tin (mẫu other), gắn Cần hỗ trợ thêm, không sự kiện, không tự gửi', () => {
    expect(replyCapClosingDecision()).toMatchObject({
      action: 'redirect',
      reason: 'customer_post_reply_cap',
      needsSupportTag: true,
      redirectTemplates: ['other'],
      answeredTopics: [],
      autoSendPolicy: 'never',
    });
  });
});
