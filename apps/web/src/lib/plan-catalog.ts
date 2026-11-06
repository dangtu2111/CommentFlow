/**
 * Danh mục gói HIỂN THỊ ở trang Gói & Thanh toán (FR-090; docs/10 §3 bảng `plans`). TẠM THỜI: bảng `plans` chưa có
 * (gap `PLANS-SCHEMA`, làn b) nên số liệu lấy đúng từ docs/10 — không thêm gói/giá nào khác. Khi có bảng, thay nguồn
 * dữ liệu ở đây, giữ nguyên kiểu `PlanInfo`.
 */
export type PlanCode = 'starter' | 'growth' | 'business';

export type PlanInfo = {
  code: PlanCode;
  priceVnd: number;
  channelsLimit: number;
  monthlyTurns: number;
  /** BR-05: Starter không có AI tự trả lời. */
  autoReply: boolean;
};

export const PLAN_CATALOG: readonly PlanInfo[] = [
  { code: 'starter', priceVnd: 299_000, channelsLimit: 1, monthlyTurns: 1000, autoReply: false },
  { code: 'growth', priceVnd: 699_000, channelsLimit: 3, monthlyTurns: 3000, autoReply: true },
  { code: 'business', priceVnd: 1_490_000, channelsLimit: 10, monthlyTurns: 7500, autoReply: true },
];

/** Gói mua thêm (add-on, docs/10 §3): +1.000 lượt, 149k mỗi lần nạp. */
export const ADDON_TURNS = { priceVnd: 149_000, turns: 1000 } as const;

const YEARLY_DISCOUNT = 0.2;

export function planByCode(code: string): PlanInfo | undefined {
  return PLAN_CATALOG.find((plan) => plan.code === code);
}

/** 1.490.000 → "1.490.000đ" (không phụ thuộc ICU của máy chạy). */
export function formatVnd(amount: number): string {
  return `${Math.trunc(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

/** 3000 → "3.000". */
export function formatCount(value: number): string {
  return formatVnd(value).slice(0, -1);
}

/** Giá theo năm = 12 tháng giảm 20%, làm tròn xuống nghìn đồng. */
export function yearlyPriceVnd(monthlyVnd: number): number {
  return Math.floor((monthlyVnd * 12 * (1 - YEARLY_DISCOUNT)) / 1000) * 1000;
}
