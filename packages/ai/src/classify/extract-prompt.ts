import { COMMENT_LABELS, type MaskedText, unsafeMarkMasked } from '@flow/shared';
import type { LlmMessage } from '../llm-client';

const MAX_TEXT_CHARS = 2000;

export type ExtractInput = {
  workspaceId: string;
  /** Bình luận ĐÃ che PII (nguyên tắc #6). */
  text: MaskedText;
  /** Khách đính kèm ảnh/video/sticker (FR-143) — giúp đánh dấu `refers_to_image`. */
  hasMedia?: boolean;
};

// Chuỗi CỐ ĐỊNH (không chứa nội dung khách) nên được đánh dấu đã che.
const SYSTEM_PROMPT = unsafeMarkMasked(
  [
    'Bạn phân loại và tách thông tin từ MỘT bình luận của khách trên bài bán hàng. Chỉ trả về MỘT object JSON, không giải thích.',
    `labels: mảng {label, confidence 0..1}, label thuộc: ${COMMENT_LABELS.join(', ')} (price=hỏi giá, advice=xin tư vấn, purchase=muốn mua/đặt, complaint=khiếu nại, spam, other). Một câu nhiều ý thì trả nhiều nhãn.`,
    'product_mentions: mảng tên sản phẩm khách nhắc. refers_to_image: true nếu câu phụ thuộc ảnh/video đính kèm.',
    'size, color: chuỗi hoặc null. height_cm, weight_kg: số hoặc null. qty: số nguyên hoặc null. cited_price_vnd: giá khách nhắc (số nguyên VND) hoặc null.',
    'order_intent: null nếu không đặt hàng, ngược lại {items: mảng chuỗi, phone: null, address: chuỗi hoặc null}. Văn bản đã che số điện thoại/email: không đoán.',
    'asks: mảng các ý khách hỏi (ví dụ giá, size, màu, tồn kho, ship).',
    'Chỉ tách thông tin có trong bình luận; không có thì null/mảng rỗng. Không bịa số.',
  ].join('\n'),
);

/** Dựng tin nhắn gửi LLM: system cố định + bình luận đã che (cắt ở 2000 ký tự). */
export function buildExtractMessages(input: ExtractInput): LlmMessage[] {
  const body = input.text.slice(0, MAX_TEXT_CHARS);
  const media = input.hasMedia ? '\n[Khách có đính kèm ảnh/video]' : '';
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: unsafeMarkMasked(`Bình luận:\n${body}${media}`) as MaskedText },
  ];
}
