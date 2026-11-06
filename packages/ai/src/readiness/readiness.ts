import { foldText } from '@flow/shared';
import { READINESS_MIN_PERCENT } from '../gate/auto-send-gate';

/**
 * Độ sẵn sàng của AI (FR-146, US-107). Hàm thuần: nhận SỐ LIỆU đã đọc từ DB, trả điểm + mục còn thiếu.
 * Không gọi LLM, không bịa số: "câu mẫu trả lời được" = dữ liệu nguồn cần cho câu đó ĐÃ CÓ (kiểm bằng code);
 * đo chất lượng trả lời thật bằng LLM thuộc `AI-EVAL-*` (Q-AR1).
 */

export type ReadinessLang = 'vi' | 'en';
type ContentLang = ReadinessLang | 'all';
export type ReadinessPolicyKind = 'shipping' | 'return' | 'warranty' | 'payment' | 'other';

export type ReadinessInput = {
  /** Ngôn ngữ đang đo; mục `all` tính cho cả hai. */
  lang: ReadinessLang;
  /** Số liệu sản phẩm đang hoạt động (đếm ở DB, không đọc giá trị). */
  products: {
    withPrice: number;
    withStock: number;
    variantsWithSize: number;
    variantsWithColor: number;
  };
  shopProfiles: Array<{
    lang: ContentLang;
    contact?: string | null;
    openingHours?: string | null;
    address?: string | null;
  }>;
  policies: Array<{ kind: ReadinessPolicyKind; lang: ContentLang; content: string }>;
  faqs: Array<{ lang: ContentLang; question: string; tags: readonly string[] }>;
};

/** Bốn mục bắt buộc của onboarding (FR-146), theo thứ tự hiển thị. */
export const READINESS_REQUIRED_ITEMS = [
  'product_price',
  'shipping_policy',
  'return_policy',
  'contact_hours',
] as const;
export type ReadinessRequiredItem = (typeof READINESS_REQUIRED_ITEMS)[number];

export type ReadinessTopic =
  | 'price'
  | 'size'
  | 'color'
  | 'stock'
  | 'shipping'
  | 'return'
  | 'warranty'
  | 'payment'
  | 'hours'
  | 'contact'
  | 'address'
  | 'promo';

/** 20 câu hỏi mẫu hệ thống (vi/en dùng chung id; chuỗi hiển thị ở i18n `readiness.sample.<id>`). */
export const READINESS_SAMPLE_QUESTIONS: ReadonlyArray<{ id: string; topic: ReadinessTopic }> = [
  { id: 'price_item', topic: 'price' },
  { id: 'price_variant', topic: 'price' },
  { id: 'price_total', topic: 'price' },
  { id: 'size_available', topic: 'size' },
  { id: 'size_advice', topic: 'size' },
  { id: 'color_available', topic: 'color' },
  { id: 'stock_item', topic: 'stock' },
  { id: 'stock_variant', topic: 'stock' },
  { id: 'ship_fee', topic: 'shipping' },
  { id: 'ship_time', topic: 'shipping' },
  { id: 'ship_area', topic: 'shipping' },
  { id: 'return_policy', topic: 'return' },
  { id: 'return_condition', topic: 'return' },
  { id: 'warranty', topic: 'warranty' },
  { id: 'payment_method', topic: 'payment' },
  { id: 'payment_cod', topic: 'payment' },
  { id: 'opening_hours', topic: 'hours' },
  { id: 'contact', topic: 'contact' },
  { id: 'address', topic: 'address' },
  { id: 'promo', topic: 'promo' },
];

/** Từ khóa (đã bỏ dấu, thường) để FAQ được tính là phủ một chủ đề. */
const FAQ_KEYWORDS: Partial<Record<ReadinessTopic, readonly string[]>> = {
  size: ['size', 'kich co', 'kich thuoc'],
  shipping: ['ship', 'giao hang', 'van chuyen', 'delivery'],
  return: ['doi tra', 'hoan tra', 'return', 'refund', 'exchange'],
  warranty: ['bao hanh', 'warranty'],
  payment: ['thanh toan', 'payment', 'cod'],
  promo: ['khuyen mai', 'giam gia', 'promo', 'discount', 'voucher'],
  hours: ['gio lam viec', 'gio mo cua', 'opening hours'],
  contact: ['lien he', 'contact', 'hotline'],
  address: ['dia chi', 'address'],
};

const SCORE_WEIGHT_REQUIRED = 0.4;
const SCORE_WEIGHT_SAMPLES = 0.6;

export type ReadinessResult = {
  /** 0–100, làm tròn. */
  score: number;
  /** Đủ cả 4 mục bắt buộc VÀ điểm ≥ ngưỡng (`READINESS_MIN_PERCENT`) → được bật Tự động. */
  ready: boolean;
  requiredDone: number;
  requiredTotal: number;
  missingRequired: ReadinessRequiredItem[];
  samplePassed: number;
  sampleTotal: number;
  /** 0–100, làm tròn. */
  samplePassRate: number;
  samples: Array<{ id: string; topic: ReadinessTopic; answerable: boolean }>;
  /** Chủ đề (không trùng) có ít nhất một câu mẫu chưa trả lời được. */
  missingTopics: ReadinessTopic[];
  minPercent: number;
};

const matchesLang = (itemLang: ContentLang, lang: ReadinessLang) =>
  itemLang === 'all' || itemLang === lang;
const hasText = (v: string | null | undefined) => (v ?? '').trim() !== '';

function faqCovers(
  faqs: ReadinessInput['faqs'],
  topic: ReadinessTopic,
  lang: ReadinessLang,
): boolean {
  const keywords = FAQ_KEYWORDS[topic];
  if (!keywords) return false;
  return faqs.some(
    (f) =>
      matchesLang(f.lang, lang) &&
      [foldText(f.question), ...f.tags.map(foldText)].some((text) =>
        keywords.some((k) => text.includes(k)),
      ),
  );
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const { lang, products } = input;
  const profiles = input.shopProfiles.filter((p) => matchesLang(p.lang, lang));
  const policies = input.policies.filter((p) => matchesLang(p.lang, lang) && hasText(p.content));
  const hasPolicy = (kind: ReadinessPolicyKind) => policies.some((p) => p.kind === kind);
  const hasProfile = (field: 'contact' | 'openingHours' | 'address') =>
    profiles.some((p) => hasText(p[field]));

  const requiredDoneMap: Record<ReadinessRequiredItem, boolean> = {
    product_price: products.withPrice > 0,
    shipping_policy: hasPolicy('shipping'),
    return_policy: hasPolicy('return'),
    contact_hours: hasProfile('contact') || hasProfile('openingHours'),
  };
  const missingRequired = READINESS_REQUIRED_ITEMS.filter((item) => !requiredDoneMap[item]);

  const topicHasSource: Record<ReadinessTopic, boolean> = {
    price: products.withPrice > 0,
    stock: products.withStock > 0,
    size: products.variantsWithSize > 0,
    color: products.variantsWithColor > 0,
    shipping: hasPolicy('shipping'),
    return: hasPolicy('return'),
    warranty: hasPolicy('warranty'),
    payment: hasPolicy('payment'),
    hours: hasProfile('openingHours'),
    contact: hasProfile('contact'),
    address: hasProfile('address'),
    promo: false,
  };
  const answerable = (topic: ReadinessTopic) =>
    topicHasSource[topic] || faqCovers(input.faqs, topic, lang);

  const samples = READINESS_SAMPLE_QUESTIONS.map((q) => ({
    id: q.id,
    topic: q.topic,
    answerable: answerable(q.topic),
  }));
  const samplePassed = samples.filter((s) => s.answerable).length;
  const requiredTotal = READINESS_REQUIRED_ITEMS.length;
  const requiredDone = requiredTotal - missingRequired.length;

  const score = Math.round(
    100 *
      (SCORE_WEIGHT_REQUIRED * (requiredDone / requiredTotal) +
        SCORE_WEIGHT_SAMPLES * (samplePassed / samples.length)),
  );
  const missingTopics = [...new Set(samples.filter((s) => !s.answerable).map((s) => s.topic))];

  return {
    score,
    ready: missingRequired.length === 0 && score >= READINESS_MIN_PERCENT,
    requiredDone,
    requiredTotal,
    missingRequired,
    samplePassed,
    sampleTotal: samples.length,
    samplePassRate: Math.round((100 * samplePassed) / samples.length),
    samples,
    missingTopics,
    minPercent: READINESS_MIN_PERCENT,
  };
}
