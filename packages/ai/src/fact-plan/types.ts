/**
 * DRAFT-FACT-SLOTS (ADR 017): "fact plan" do CODE lập trước bước soạn — mỗi sự kiện cần nói có giá trị từ dữ liệu có cấu trúc hoặc `unknown`. LLM chỉ viết câu với chỗ giữ chỗ
 * `{fact:id}`; code điền giá trị. Không có số/khẳng định nào do model tự viết.
 */
export type FactTopic =
  | 'price'
  | 'stock'
  | 'ship_fee'
  | 'ship_time'
  | 'cod'
  | 'returns'
  | 'warranty'
  | 'payment';

export type FactKind =
  | 'product_name'
  | 'variant'
  | 'customer_measure'
  | 'price'
  | 'price_range'
  | 'stock'
  | 'ship_fee'
  | 'ship_time'
  | 'cod'
  | 'returns'
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
  | { type: 'methods'; methods: string[] };

export type Fact =
  | { id: string; kind: FactKind; status: 'known'; value: FactValue; sourceId: string }
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
  /** Dòng có nói riêng về COD thì ưu tiên hơn `cod` chung. */
  cod?: boolean | null;
  sourceId: string;
};

export type PolicyFacts = {
  shipping: ShipRow[];
  cod?: { value: boolean; sourceId: string } | null;
  returns?: { days: number | null; none?: boolean; conditions?: string[]; sourceId: string } | null;
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
  /** Dòng chính sách không hợp lệ bị bỏ qua (vd "nội thành" thiếu thành phố) — để báo Owner. */
  issues: string[];
};
