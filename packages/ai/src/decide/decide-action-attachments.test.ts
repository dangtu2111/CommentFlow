import { describe, expect, it } from 'vitest';
import { type DecideActionInput, decideAction } from './decide-action';

const NO_RISK = {
  priceConflict: false,
  legalUnsourced: false,
  impersonation: false,
  stockStale: false,
} as const;

function base(over: Partial<DecideActionInput> = {}): DecideActionInput {
  return {
    lang: 'vi',
    extract: {
      labels: [{ label: 'price' }],
      refers_to_image: false,
      size: null,
      color: null,
      height_cm: null,
      weight_kg: null,
    },
    products: { candidates: ['Áo thun A'], missingAxes: [] },
    topics: [{ topic: 'product_info', sourced: true }],
    thread: { clarifyCount: 0, repeatCount: 0 },
    risks: NO_RISK,
    ...over,
  };
}

const photo = (text: string) => ({ text, attachmentTypes: ['photo'] });

describe('FR-143 decideAction — ảnh/video kèm chữ, chưa nhận ra sản phẩm', () => {
  it('ảnh + "mẫu này" + chưa có ứng viên → chuyển người, lý do image_product', () => {
    const d = decideAction(
      base({ products: { candidates: [], missingAxes: [] }, comment: photo('mẫu này giá sao') }),
    );
    expect(d).toMatchObject({
      action: 'clarify',
      reason: 'image_product',
      needsHuman: true,
      autoSendPolicy: 'never',
    });
  });

  it('ảnh phụ thuộc + nhiều ứng viên → chuyển người, kèm lựa chọn', () => {
    const d = decideAction(
      base({
        products: { candidates: ['A', 'B'], missingAxes: [] },
        comment: { text: 'giá?', attachmentTypes: ['video'] },
      }),
    );
    expect(d).toMatchObject({ reason: 'image_product', needsHuman: true });
    expect(d.clarify?.options).toEqual(['A', 'B']);
  });

  it('đã nhận đúng một sản phẩm (từ bài/bí danh) → không chặn', () => {
    const d = decideAction(base({ comment: photo('mẫu này giá sao') }));
    expect(d).toMatchObject({ action: 'answer', needsHuman: false });
  });

  it('chỉ sticker kèm chữ → không coi là phụ thuộc ảnh', () => {
    const d = decideAction(
      base({
        products: { candidates: [], missingAxes: [] },
        topics: [{ topic: 'product_info', sourced: true }],
        comment: { text: 'mẫu này giá sao', attachmentTypes: ['sticker'] },
      }),
    );
    expect(d.reason).not.toBe('image_product');
  });

  it('cờ model vẫn có tác dụng khi không có comment (hành vi cũ)', () => {
    const d = decideAction(
      base({
        products: { candidates: [], missingAxes: [] },
        extract: { ...base().extract, refers_to_image: true },
      }),
    );
    expect(d.reason).toBe('image_product');
  });

  it('không có comment → hành vi cũ không đổi', () => {
    expect(decideAction(base())).toMatchObject({ action: 'answer', reason: 'all_sourced' });
  });

  it('comment hỏng → handoff input_unreadable, không ném', () => {
    expect(
      decideAction(base({ comment: { text: 5, attachmentTypes: 'photo' } as never })),
    ).toMatchObject({ action: 'handoff', reason: 'input_unreadable' });
  });

  it('rủi ro vẫn thắng quy tắc ảnh', () => {
    const d = decideAction(
      base({
        products: { candidates: [], missingAxes: [] },
        risks: { ...NO_RISK, impersonation: true },
        comment: photo('mẫu này'),
      }),
    );
    expect(d.reason).toBe('impersonation');
  });
});
