import type { ExtractedContacts } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  checkOrderReplyLeak,
  evaluateOrderInComment,
  handleOrderInComment,
  MAX_ORDER_COMMENT_LENGTH,
  ORDER_RECEIVED_REPLIES,
} from './order-comment-rules';

const evalText = (text: string, extra: { orderIntent?: boolean; authorIsPage?: boolean } = {}) =>
  evaluateOrderInComment({ text, ...extra });

describe('FR-156 phát hiện đặt hàng trong bình luận', () => {
  it('SĐT + ý chốt đơn → detected, gợi ý ẩn', () => {
    const r = evalText('Chốt áo size M, em lấy 2 cái, sđt 0912345678');
    expect(r.detected).toBe(true);
    expect(r.hasPhone).toBe(true);
    expect(r.reasons).toContain('phone');
    expect(r.suggestHide).toBe(true);
    expect(r.unreadable).toBe(false);
  });

  it('địa chỉ + ý đặt → detected dù không có SĐT', () => {
    const r = evalText('Mình đặt 1 cái, ship về 12 đường Lê Lợi, phường Bến Nghé, quận 1');
    expect(r.detected).toBe(true);
    expect(r.hasAddress).toBe(true);
    expect(r.hasPhone).toBe(false);
    // Địa chỉ chưa có chỗ lưu → không gợi ý ẩn (khỏi mất thông tin khách).
    expect(r.suggestHide).toBe(false);
  });

  it('từ trùng sau khi bỏ dấu (quần/tình trạng) không bị coi là địa chỉ', () => {
    expect(evalText('Chốt quần này, tình trạng còn không?').hasAddress).toBe(false);
    expect(evalText('Mua quần ống đường may đẹp, tính tiền giúp').detected).toBe(false);
  });

  it('chỉ SĐT không có ý đặt → không phải đơn (để auto-hide/PII lo)', () => {
    const r = evalText('Liên hệ 0912345678 nhé');
    expect(r.detected).toBe(false);
    expect(r.hasPhone).toBe(true);
    expect(r.suggestHide).toBe(false);
  });

  it('chỉ ý đặt không có liên hệ → không', () => {
    expect(evalText('Chốt đơn nhé shop').detected).toBe(false);
    expect(evalText('Mình lấy size M').detected).toBe(false);
  });

  it('cờ order_intent của extract thay cho từ khóa', () => {
    expect(evalText('0912345678', { orderIntent: true }).detected).toBe(true);
    expect(evalText('hello', { orderIntent: true }).detected).toBe(false);
  });

  it('chống né: SĐT cách chấm, khoảng trắng, chữ toàn khổ, zero-width', () => {
    for (const phone of ['0912.345.678', '091 234 56 78', '０９１２３４５６７８', '09123​45678']) {
      expect(evalText(`Chốt đơn nhé ${phone}`).detected).toBe(true);
    }
  });

  it('+84 cũng nhận', () => {
    expect(evalText('em đặt 1 cái, +84912345678').hasPhone).toBe(true);
  });

  it('bình luận do chính Page viết bị bỏ qua (nguyên tắc #5)', () => {
    const r = evalText('Chốt đơn nhé 0912345678', { authorIsPage: true });
    expect(r.detected).toBe(false);
    expect(r.suggestHide).toBe(false);
  });

  it('từ "lấy" trong từ khác không tính (ranh giới từ)', () => {
    expect(evalText('0912345678 lấyyy').detected).toBe(false);
  });

  it('quá dài/không phải chuỗi → unreadable, không ném', () => {
    const long = evalText('a'.repeat(MAX_ORDER_COMMENT_LENGTH + 1));
    expect(long.unreadable).toBe(true);
    expect(long.detected).toBe(false);
    expect(long.suggestHide).toBe(false);
    expect(() => evaluateOrderInComment(null)).not.toThrow();
    expect(evaluateOrderInComment({ text: 5 }).unreadable).toBe(true);
  });

  it('property: không bao giờ ném; suggestHide ⇒ detected; không có SĐT/địa chỉ ⇒ không detected', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const r = evaluateOrderInComment(value);
        if (r.suggestHide) expect(r.detected).toBe(true);
        if (r.detected) expect(r.hasPhone || r.hasAddress).toBe(true);
      }),
    );
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), fc.boolean(), (text, intent) => {
        const r = evalText(text, { orderIntent: intent });
        if (r.suggestHide) expect(r.detected).toBe(true);
        if (r.detected) expect(r.hasPhone || r.hasAddress).toBe(true);
        expect(Object.keys(r).sort()).toEqual(
          ['detected', 'hasAddress', 'hasPhone', 'reasons', 'suggestHide', 'unreadable'].sort(),
        );
      }),
    );
  });

  it('property: thêm SĐT hợp lệ vào câu có ý đặt luôn detected', () => {
    const digits = fc.stringMatching(/^[0-9]{7}$/);
    fc.assert(
      fc.property(fc.constantFrom('3', '5', '7', '8', '9'), digits, (head, tail) => {
        expect(evalText(`chốt đơn 0${head}1${tail}`).detected).toBe(true);
      }),
    );
  });
});

describe('FR-156 câu công khai cố định, không lặp lại thông tin khách', () => {
  it('mẫu vi/en không chứa SĐT, email, địa chỉ', () => {
    for (const reply of Object.values(ORDER_RECEIVED_REPLIES)) {
      const r = evaluateOrderInComment({ text: `${reply} chốt đơn` });
      expect(r.hasPhone).toBe(false);
      expect(r.hasAddress).toBe(false);
      expect(/\d/.test(reply)).toBe(false);
    }
  });

  it('checkOrderReplyLeak bắt SĐT, email, địa chỉ, dãy số của khách', () => {
    const comment = 'đặt 1 cái, 12 đường Lê Lợi, sđt 0912345678';
    expect(checkOrderReplyLeak(ORDER_RECEIVED_REPLIES.vi, comment)).toBe(true);
    expect(checkOrderReplyLeak('Shop gọi 0912345678 nhé', comment)).toBe(false);
    expect(checkOrderReplyLeak('gửi về a@b.com', comment)).toBe(false);
    expect(checkOrderReplyLeak('ship về 12 đường Lê Lợi', comment)).toBe(false);
    expect(checkOrderReplyLeak('mã 12345 ạ', 'địa chỉ 12345 phố')).toBe(false);
  });

  it('property: câu mẫu luôn an toàn với mọi bình luận', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (text) => {
        expect(checkOrderReplyLeak(ORDER_RECEIVED_REPLIES.vi, text)).toBe(true);
        expect(checkOrderReplyLeak(ORDER_RECEIVED_REPLIES.en, text)).toBe(true);
      }),
    );
  });
});

describe('FR-156 handleOrderInComment: lưu khách TRƯỚC, rồi mới trả hướng chuyển inbox', () => {
  const text = 'Chốt đơn áo M, sđt 0912345678, giao 5 đường Hai Bà Trưng phường 3 quận 1';
  const baseInput = {
    workspaceId: 'w1',
    commentId: 'c1',
    text,
    lang: 'vi' as const,
    authorIsPage: false,
  };

  it('lưu trước, câu công khai cố định, không tự gửi, không có đường ẩn', async () => {
    const calls: string[] = [];
    const save = vi.fn(async (_w: string, contacts: ExtractedContacts) => {
      calls.push(`save:${contacts.phones.join(',')}`);
    });
    const result = await handleOrderInComment(baseInput, { contactSink: { save } });
    expect(calls).toEqual(['save:0912345678']);
    expect(result.outcome).toBe('redirect_to_dm');
    if (result.outcome !== 'redirect_to_dm') return;
    expect(result.reply).toBe(ORDER_RECEIVED_REPLIES.vi);
    expect(result.suggestHide).toBe(true);
    expect(result.autoSendPolicy).toBe('never');
    expect(result.needsHuman).toBe(true);
    // Có địa chỉ mà `maskPii` chưa che địa chỉ → không trả bản "đã che" để đi LLM.
    expect(result.maskedText).toBeNull();
    expect(JSON.stringify(result)).not.toContain('0912345678');
    expect(JSON.stringify(result)).not.toContain('Hai Bà Trưng');
    expect(Object.keys(result).some((k) => /^(hide|requestHide)/i.test(k))).toBe(false);
  });

  it('lang en → câu tiếng Anh; lang other → không có câu, chuyển người', async () => {
    const save = vi.fn(async () => {});
    const en = await handleOrderInComment({ ...baseInput, lang: 'en' }, { contactSink: { save } });
    expect(en.outcome === 'redirect_to_dm' && en.reply).toBe(ORDER_RECEIVED_REPLIES.en);
    const other = await handleOrderInComment(
      { ...baseInput, lang: 'other' },
      { contactSink: { save } },
    );
    expect(other.outcome).toBe('redirect_to_dm');
    if (other.outcome === 'redirect_to_dm') {
      expect(other.reply).toBeNull();
      expect(other.needsHuman).toBe(true);
    }
  });

  it('lưu lỗi → held, không câu công khai, không lộ SĐT', async () => {
    const save = vi.fn(async () => {
      throw new Error('db down 0912345678');
    });
    const result = await handleOrderInComment(baseInput, { contactSink: { save } });
    expect(result).toEqual({ outcome: 'held', reason: 'lead_save_failed' });
    expect(JSON.stringify(result)).not.toContain('0912345678');
  });

  it('không phải đơn → not_order và KHÔNG gọi lưu', async () => {
    const save = vi.fn(async () => {});
    const result = await handleOrderInComment(
      { ...baseInput, text: 'Áo này còn không shop?' },
      { contactSink: { save } },
    );
    expect(result).toEqual({ outcome: 'not_order' });
    expect(save).not.toHaveBeenCalled();
  });

  it('đầu vào hỏng → held (unreadable), chuyển người, không ném', async () => {
    const save = vi.fn(async () => {});
    const result = await handleOrderInComment({ nonsense: 1 }, { contactSink: { save } });
    expect(result).toEqual({ outcome: 'held', reason: 'unreadable' });
    expect(save).not.toHaveBeenCalled();
  });

  it('chỉ có SĐT (không địa chỉ) → trả bản đã che, SĐT không lọt', async () => {
    const save = vi.fn(async () => {});
    const result = await handleOrderInComment(
      { ...baseInput, text: 'Chốt đơn nhé 0912345678' },
      { contactSink: { save } },
    );
    expect(result.outcome === 'redirect_to_dm' && result.maskedText).toBe('Chốt đơn nhé [sđt]');
  });

  it('chỉ có địa chỉ (không SĐT) → vẫn chuyển inbox nhưng KHÔNG gợi ý ẩn, không trả bản che', async () => {
    const save = vi.fn(async () => {});
    const result = await handleOrderInComment(
      { ...baseInput, text: 'Em đặt 1 cái, giao 12 đường Lê Lợi, phường 3' },
      { contactSink: { save } },
    );
    expect(result.outcome).toBe('redirect_to_dm');
    if (result.outcome === 'redirect_to_dm') {
      expect(result.suggestHide).toBe(false);
      expect(result.maskedText).toBeNull();
    }
  });

  it('thiếu authorIsPage → held (unreadable), không gọi lưu; Page tự viết → not_order', async () => {
    const save = vi.fn(async () => {});
    const { authorIsPage: _omit, ...missing } = baseInput;
    expect(await handleOrderInComment(missing, { contactSink: { save } })).toEqual({
      outcome: 'held',
      reason: 'unreadable',
    });
    expect(
      await handleOrderInComment({ ...baseInput, authorIsPage: true }, { contactSink: { save } }),
    ).toEqual({ outcome: 'not_order' });
    expect(save).not.toHaveBeenCalled();
  });

  it('cờ order_intent của extract được dùng', async () => {
    const save = vi.fn(async () => {});
    const result = await handleOrderInComment(
      { ...baseInput, text: '0912345678', orderIntent: true },
      { contactSink: { save } },
    );
    expect(result.outcome).toBe('redirect_to_dm');
  });
});
