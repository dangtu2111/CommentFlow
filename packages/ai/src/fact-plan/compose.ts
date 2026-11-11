import type { FactKind, FactPlan, FactTopic } from './types';

/**
 * Phần do CODE dựng (không LLM) của chế độ chỗ giữ chỗ (ADR 017): danh sách sự kiện bắt buộc phải có trong câu trả lời, câu dự phòng khi mọi bản của LLM bị từ chối, và câu mời cho chủ đề chưa có
 * thông tin. Câu mời mặc định theo xưng hô cấu hình; mẫu riêng của shop (`brand_voice.handoff_templates`) thay thế ở GUARD-REDIRECT-TEMPLATE/nhóm (7).
 */
const CONTEXT_KINDS: ReadonlySet<FactKind> = new Set([
  'product_name',
  'variant',
  'customer_measure',
]);

/** Sự kiện ĐÃ BIẾT mà câu trả lời phải nêu (không gồm tên/biến thể/số khách — chỉ là chất liệu câu). */
export function requiredFactIds(plan: FactPlan): string[] {
  return plan.facts
    .filter((fact) => fact.status === 'known' && !fact.optional && !CONTEXT_KINDS.has(fact.kind))
    .map((fact) => fact.id);
}

const suffixOf = (id: string): string => id.slice(id.indexOf('.'));
/** Tên sản phẩm (+ biến thể khách chọn nếu có) cho câu dự phòng: "Áo thun ({fact:variant.1})" — giá/tồn của biến thể phải đi kèm đúng biến thể đó. */
const nameOf = (id: string, plan: FactPlan): string => {
  if (!id.includes('.')) return '';
  const suffix = suffixOf(id);
  if (!plan.facts.some((fact) => fact.id === `product_name${suffix}`)) return '';
  const variant = plan.facts.some((fact) => fact.id === `variant${suffix}`)
    ? ` ({fact:variant${suffix}})`
    : '';
  return `{fact:product_name${suffix}}${variant}`;
};

const LINES: Record<
  'vi' | 'en',
  Partial<Record<FactKind, (id: string, name: string) => string>>
> = {
  vi: {
    price: (id, name) => `${name ? `${name} giá` : 'Giá'} {fact:${id}}.`,
    price_range: (id, name) => `${name ? `${name} có giá` : 'Giá'} {fact:${id}}.`,
    stock: (id, name) => `${name ? `${name}:` : 'Tồn kho:'} {fact:${id}}.`,
    ship_fee: (id) => `Phí ship {fact:${id}}.`,
    ship_time: (id) => `Thời gian giao hàng {fact:${id}}.`,
    cod: (id) => `Shop {fact:${id}}.`,
    returns: (id) => `Về đổi trả: {fact:${id}}.`,
    warranty: (id) => `Về bảo hành: {fact:${id}}.`,
    ship_destination: (id) => `Về khu vực giao: {fact:${id}}.`,
    refund_to: (id) => `Về hoàn tiền: {fact:${id}}.`,
    return_shipping: (id) => `Về phí ship khi trả hàng: {fact:${id}}.`,
    return_eligibility: (id) => `Về điều kiện đổi trả: {fact:${id}}.`,
    payment: (id) => `Thanh toán: {fact:${id}}.`,
  },
  en: {
    price: (id, name) => `${name ? `${name} is` : 'The price is'} {fact:${id}}.`,
    price_range: (id, name) =>
      `${name ? `${name} ranges from` : 'Prices range from'} {fact:${id}}.`,
    stock: (id, name) => `${name ? `${name}:` : 'Availability:'} {fact:${id}}.`,
    ship_fee: (id) => `Shipping fee: {fact:${id}}.`,
    ship_time: (id) => `Delivery time: {fact:${id}}.`,
    cod: (id) => `We {fact:${id}}.`,
    returns: (id) => `Returns: {fact:${id}}.`,
    warranty: (id) => `Warranty: {fact:${id}}.`,
    ship_destination: (id) => `Shipping destinations: {fact:${id}}.`,
    refund_to: (id) => `Refunds: {fact:${id}}.`,
    return_shipping: (id) => `Return shipping: {fact:${id}}.`,
    return_eligibility: (id) => `Return eligibility: {fact:${id}}.`,
    payment: (id) => `Payment: {fact:${id}}.`,
  },
};

/** Câu dự phòng do code dựng từ các sự kiện bắt buộc (chỉ chỗ giữ chỗ + lời văn cố định); rỗng nếu không có gì cần nói. */
export function fallbackTemplate(plan: FactPlan, lang: 'vi' | 'en'): string {
  const lines = plan.facts.flatMap((fact) => {
    if (fact.status !== 'known' || fact.optional || CONTEXT_KINDS.has(fact.kind)) return [];
    const line = LINES[lang][fact.kind]?.(fact.id, nameOf(fact.id, plan));
    return line === undefined ? [] : [line];
  });
  return lines.join(' ');
}

const TOPIC_LABELS: Record<FactTopic, { vi: string; en: string }> = {
  price: { vi: 'giá', en: 'pricing' },
  stock: { vi: 'tồn kho', en: 'availability' },
  ship_fee: { vi: 'phí ship', en: 'shipping fees' },
  ship_time: { vi: 'thời gian giao hàng', en: 'delivery time' },
  cod: { vi: 'thanh toán COD', en: 'cash on delivery' },
  returns: { vi: 'đổi trả', en: 'returns' },
  ship_destination: { vi: 'khu vực giao hàng', en: 'shipping destinations' },
  refund_to: { vi: 'hoàn tiền', en: 'refunds' },
  return_shipping: { vi: 'phí ship khi trả hàng', en: 'return shipping' },
  return_eligibility: { vi: 'điều kiện đổi trả', en: 'return eligibility' },
  defect: { vi: 'hàng lỗi', en: 'defective items' },
  warranty: { vi: 'bảo hành', en: 'warranty' },
  payment: { vi: 'thanh toán', en: 'payment' },
};

function joinLabels(labels: string[], lang: 'vi' | 'en'): string {
  if (labels.length <= 1) return labels.join('');
  const and = lang === 'vi' ? 'và' : 'and';
  return `${labels.slice(0, -1).join(', ')} ${and} ${labels[labels.length - 1]}`;
}

/** Câu mời cho chủ đề CHƯA có thông tin; xưng hô theo cấu hình voice. Rỗng nếu không có chủ đề. */
export function inviteUnknownText(
  topics: readonly FactTopic[],
  lang: 'vi' | 'en',
  address: { shop: string; customer: string },
): string {
  if (topics.length === 0) return '';
  const labels = joinLabels(
    topics.map((topic) => TOPIC_LABELS[topic][lang]),
    lang,
  );
  if (lang === 'vi')
    return `Phần ${labels}, ${address.customer} nhắn ${address.shop} để được hỗ trợ nhé.`;
  return `For ${labels}, please message ${address.shop === 'we' ? 'us and we will help' : `${address.shop} for help`}.`;
}

/**
 * Câu HỎI khu vực do CODE viết (không gọi LLM): dùng khi khách nêu nơi nhận mà thẻ ship của shop không có dòng áp dụng cho nơi đó (ADR 018 T1),
 * không nêu phí/thời gian/COD nào. Xưng hô theo voice.
 */
export function regionClarifyText(
  lang: 'vi' | 'en',
  address: { shop: string; customer: string },
): string {
  if (lang === 'vi')
    return `${address.customer} cho ${address.shop} xin địa chỉ nhận hàng (tỉnh/thành, quận/huyện) cụ thể để ${address.shop} báo đúng phí và thời gian giao nhé?`;
  return `Could you share your exact delivery address (city/state) so ${address.shop === 'we' ? 'we' : address.shop} can confirm the shipping fee and delivery time?`;
}

// Số tiền/thời gian giao trong câu: số kèm đơn vị tiền hoặc ngày ("20.000đ", "30k", "2-4 ngày", "$5", "3 days"). Chỉ để nhận câu NÊU phí/thời gian giao.
const SHIP_NUMBER =
  /(?:\d[\d.,]*\s*(?:đ|₫|k(?![\p{L}\p{N}])|vnd|vnđ|ngày|days?|usd|dollars?)|[$€£]\s*\d)/iu;
export function mentionsShipNumbers(text: string): boolean {
  return SHIP_NUMBER.test(text);
}
