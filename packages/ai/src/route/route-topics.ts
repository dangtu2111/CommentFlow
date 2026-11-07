/**
 * Chủ đề của một ý hỏi (`extract.asks`) cho bước `route` (FR-136). Thuần, 0 chi phí: so từ khóa trên văn bản
 * đã bỏ dấu. Chỉ bốn chủ đề tra được bằng SQL trên `product_variants` (giá, size, màu, tồn) là "lõi";
 * mọi thứ khác — ship, đổi trả, bảo hành, ý lạ — là `other` (thiên về tìm thêm, Q-PR1).
 */
export type AskTopic = 'price' | 'size' | 'color' | 'stock' | 'other';

/** Chủ đề tra được bằng SQL trên biến thể. */
export const SQL_ASK_TOPICS: readonly AskTopic[] = ['price', 'size', 'color', 'stock'];

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
}

// Ý ngoài phạm vi SQL — kiểm TRƯỚC: "ship về Cà Mau bao nhiêu" chứa "mau" và "bao nhieu" nhưng là hỏi phí giao.
const OTHER_INTENT =
  /\b(ship|van chuyen|giao|phi|doi|tra hang|hoan|bao hanh|thanh toan|cod|giam gia|khuyen mai|voucher|ma giam|tang|shipping|delivery|return|refund|warranty|discount|coupon)\b/;

const TOPIC_PATTERNS: ReadonlyArray<readonly [AskTopic, RegExp]> = [
  [
    'stock',
    /\b(con hang|het hang|con khong|con ko|con k|ton kho|so luong ton|in stock|stock|available|availability|inventory)\b/,
  ],
  ['size', /\b(size|kich co|kich thuoc|sz)\b/],
  ['color', /\b(mau|color|colour)\b/],
  ['price', /\b(gia|bao nhieu|nhieu tien|price|how much|cost)\b/],
];

/** Phân loại một ý hỏi; không nhận ra → `other`. */
export function classifyAsk(ask: string): AskTopic {
  const text = fold(ask);
  if (OTHER_INTENT.test(text)) return 'other';
  for (const [topic, pattern] of TOPIC_PATTERNS) {
    if (pattern.test(text)) return topic;
  }
  return 'other';
}
