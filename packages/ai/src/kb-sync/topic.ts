import { foldText, type KbTopic } from '@flow/shared';

export type PolicyKind = 'shipping' | 'return' | 'warranty' | 'payment' | 'other';

const KIND_FALLBACK: Record<PolicyKind, KbTopic> = {
  shipping: 'shipping_time',
  return: 'return',
  warranty: 'warranty',
  payment: 'payment',
  other: 'other',
};

/** Thứ tự quan trọng: cụ thể trước (hoàn tiền, phí ship) rồi mới chung (giao hàng, đổi trả). Khớp trên văn bản đã bỏ dấu. */
const RULES: ReadonlyArray<readonly [KbTopic, RegExp]> = [
  ['refund', /\bhoan tien\b|\brefund\b/],
  [
    'shipping_fee',
    /\bphi (van chuyen|ship|giao)\b|\bfreeship\b|\bmien phi (van chuyen|ship|giao)\b|\bshipping (fee|cost)\b/,
  ],
  ['shipping_time', /\bgiao hang\b|\bgiao\b|\bship\b|\bvan chuyen\b|\bnhan hang\b|\bdeliver/],
  ['return', /\bdoi tra\b|\bdoi hang\b|\btra hang\b|\breturn\b|\bexchange\b/],
  ['warranty', /\bbao hanh\b|\bwarranty\b/],
  ['payment', /\bthanh toan\b|\bcod\b|\bchuyen khoan\b|\bpayment\b/],
];

/** Chủ đề của một đoạn chính sách: theo từ khóa trong nội dung, không khớp thì theo LOẠI chính sách (hàm thuần). */
export function classifyTopic(text: string, kind: PolicyKind): KbTopic {
  const folded = foldText(text);
  for (const [topic, pattern] of RULES) {
    if (pattern.test(folded)) return topic;
  }
  return KIND_FALLBACK[kind];
}
