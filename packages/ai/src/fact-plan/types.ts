/**
 * DRAFT-FACT-SLOTS (ADR 017): "fact plan" do CODE lập trước bước soạn — mỗi sự kiện cần nói có giá trị từ dữ liệu có cấu trúc hoặc `unknown`. LLM chỉ viết câu với chỗ giữ chỗ
 * `{fact:id}`; code điền giá trị. Không có số/khẳng định nào do model tự viết.
 */
/** Chủ đề sự kiện do bước `extract` trả (enum, Zod) — KHÔNG đoán bằng từ khóa. Chỉ đánh dấu chủ đề câu hỏi THẬT SỰ hỏi. */
export const FACT_TOPICS = [
  'price',
  'stock',
  'ship_fee',
  'ship_time',
  'ship_destination',
  'cod',
  'returns',
  'refund_to',
  'return_shipping',
  'return_eligibility',
  'defect',
  'warranty',
  'payment',
] as const;
export type FactTopic = (typeof FACT_TOPICS)[number];

export type FactKind =
  | 'product_name'
  | 'variant'
  | 'customer_measure'
  | 'price'
  | 'price_range'
  | 'stock'
  | 'ship_fee'
  | 'ship_time'
  | 'ship_destination'
  | 'cod'
  | 'returns'
  | 'refund_to'
  | 'return_shipping'
  | 'return_eligibility'
  | 'defect'
  | 'warranty'
  | 'payment';

export type FactValue =
  | { type: 'text'; text: string }
  /** `amountMinor`: VND = đồng; ngoại tệ = đơn vị nhỏ nhất (USD: cent). Không quy đổi tỷ giá (nguyên tắc #4). */
  | { type: 'money'; amountMinor: number; currency: string }
  | { type: 'money_range'; minMinor: number; maxMinor: number; currency: string }
  | { type: 'days'; min: number; max: number }
  | { type: 'bool'; value: boolean }
  /** `low` = sắp hết (≤ ngưỡng của Owner); `count` chỉ khi Owner bật "Nêu số lượng tồn". */
  | { type: 'stock'; display: 'in' | 'out' | 'count' | 'low'; n?: number }
  /** Chính sách ghi rõ KHÔNG có (không đổi trả / không bảo hành). */
  | { type: 'none' }
  /** `conditions`/`scope`: nguyên văn từ nguồn chính sách — luôn được ghép vào câu để không khẳng định rộng hơn chính sách. */
  | { type: 'days_count'; n: number; conditions?: string[] }
  | { type: 'months_count'; n: number; scope?: string }
  | { type: 'methods'; methods: string[] }
  /** Phí ship định tính (ENUM; code viết câu theo ngôn ngữ khách). `free_over`: miễn phí từ `overMinor`. */
  | {
      type: 'fee_mode';
      mode: 'at_checkout' | 'free' | 'free_over';
      overMinor?: number;
      currency?: string;
    }
  | { type: 'days_mode'; mode: 'at_checkout' }
  /** Giao tới nơi khách hỏi: `ok` = nằm trong vùng giao; `shipsTo` = các quốc gia shop giao (mã ISO) để nêu khi không khớp. */
  | { type: 'destination'; ok: boolean; place: string; shipsTo: string[]; nationwide?: boolean }
  | { type: 'refund_to'; to: 'original_payment' }
  | { type: 'return_shipping'; payer: 'customer_change_of_mind' | 'shop' }
  | { type: 'return_eligibility'; mode: 'varies_by_item' };

export type Fact =
  | {
      id: string;
      kind: FactKind;
      status: 'known';
      value: FactValue;
      sourceId: string;
      /** Được PHÉP dùng nhưng không bắt buộc (sự kiện đi kèm cùng dòng nguồn, vd. thời gian giao khi khách chỉ hỏi phí). */
      optional?: true;
    }
  | { id: string; kind: FactKind; status: 'unknown' };

export type ShipRow = {
  /** `nationwide`: toàn quốc (mặc định cho địa điểm trong VN không khớp dòng khác); `city`: nội thành MỘT thành phố (BẮT BUỘC ghi `city`); `region`: danh sách tỉnh/thành. */
  kind: 'nationwide' | 'city' | 'region';
  label: string;
  city?: string;
  places?: string[];
  feeMinor: number | null;
  currency: string;
  daysMin: number | null;
  daysMax: number | null;
  /** Phí định tính; thiếu = suy từ `feeMinor` (có số → `fixed`). */
  feeMode?: 'fixed' | 'at_checkout' | 'free' | 'free_over';
  freeOverMinor?: number | null;
  daysMode?: 'range' | 'at_checkout' | 'not_stated';
  /** Mã quốc gia giao tới (ISO); thiếu = `["VN"]`. */
  destinations?: string[];
  /** Dòng có nói riêng về COD thì ưu tiên hơn `cod` chung. */
  cod?: boolean | null;
  sourceId: string;
};

export type PolicyFacts = {
  shipping: ShipRow[];
  cod?: { value: boolean; sourceId: string } | null;
  returns?: {
    days: number | null;
    none?: boolean;
    conditions?: string[];
    refundTo?: 'original_payment' | null;
    returnShippingPaidBy?: 'customer_change_of_mind' | 'shop' | null;
    eligibility?: 'varies_by_item' | null;
    sourceId: string;
  } | null;
  warranty?: { months: number | null; none?: boolean; scope?: string; sourceId: string } | null;
  payment?: { methods: string[]; sourceId: string } | null;
};

export type PlanVariant = {
  label: string;
  attrsNorm: Record<string, string>;
  priceMinor: number | null;
  stock: number | null;
};

export type PlanProduct = {
  id: string;
  name: string;
  /** `VND` hoặc mã tiền tệ nguồn (USD…). */
  currency: string;
  priceMinor: number | null;
  stock: number | null;
  /** Tồn cũ quá hạn (FR-151) → sự kiện tồn là `unknown`. */
  stockStale?: boolean;
  variants: PlanVariant[];
};

export type StockMode = { disclose: 'status' | 'count'; lowAt: number | null };

export type FactPlanInput = {
  products: PlanProduct[];
  topics: FactTopic[];
  /** Câu khách + ý hỏi (đã che PII): chỉ để CODE khớp phạm vi bảo hành cho chủ đề `defect` (không gọi LLM, không đồng nghĩa). */
  customerText?: string;
  /** Nơi giao khách hỏi (đã quy về quốc gia) — chủ đề `ship_destination` và lọc dòng ship theo quốc gia. */
  destination?: { country: string; label: string } | null;
  /** Văn bản nêu địa điểm của khách (nếu có). */
  location?: string | null;
  /** Thuộc tính biến thể khách nêu (đã chuẩn hóa), nếu có. */
  variantAttrs?: Record<string, string> | null;
  /** Số/kích thước khách tự nêu (vd "1m58", "size 29") — chỉ đi qua chỗ giữ chỗ. */
  measures?: string[];
  policy: PolicyFacts;
  stock: StockMode;
};

export type FactPlan = {
  facts: Fact[];
  /** Cần hỏi khách tỉnh/thành (phí/thời gian/COD phụ thuộc khu vực mà khách chưa nêu hoặc nêu nhiều nơi) — FR-147. */
  clarify: { ask: 'region' } | null;
  /** Chủ đề có sự kiện `unknown` (nguồn mời ib theo mẫu, ghi `unanswered_topics`). */
  unknownTopics: FactTopic[];
  /** Có câu trả lời (từ thẻ bảo hành khớp phạm vi) nhưng PHẢI qua người duyệt, không bao giờ tự gửi (hàng lỗi trùng phạm vi bảo hành). */
  requiresHumanReview?: boolean;
  /** Chủ đề phải chuyển người (vd. hàng lỗi/sai hàng: chưa có chính sách có cấu trúc). */
  handoff?: boolean;
  /** Dòng chính sách không hợp lệ bị bỏ qua (vd "nội thành" thiếu thành phố) — để báo Owner. */
  issues: string[];
};
