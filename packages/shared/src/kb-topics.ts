/**
 * Mã chủ đề cố định của câu hỏi khách / đoạn kiến thức (MỘT nguồn dùng chung cho đồng bộ kiến thức, tìm kiếm, bước extract, pipeline).
 * Thêm mã mới ở ĐÂY; nơi khác chỉ import.
 */
export const KB_TOPIC_CODES = [
  'shipping_time',
  'shipping_fee',
  'order_status',
  'return',
  'refund',
  'warranty',
  'payment',
  'product_info',
  'size',
  'stock',
  'discount',
  'legal',
  'other',
] as const;

export type KbTopic = (typeof KB_TOPIC_CODES)[number];

export function isKbTopic(value: unknown): value is KbTopic {
  return typeof value === 'string' && (KB_TOPIC_CODES as readonly string[]).includes(value);
}
