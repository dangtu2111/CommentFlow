/**
 * Trần chi phí cho EVAL chạy qua LiteLLM (chủ dự án chốt 08/11/2026): mỗi lần đo ≤ 1 USD, tổng chuỗi việc ≤ 5 USD, chi tiêu khóa ảo > 80% trần của
 * khóa → DỪNG và hỏi chủ dự án. Hàm quyết định thuần + đọc chi tiêu khóa qua `/key/info` bằng CHÍNH khóa EVAL đang dùng (không đọc tệp bí mật).
 */
export const DEFAULT_MEASUREMENT_CAP_USD = 1;
export const DEFAULT_TOTAL_CAP_USD = 5;
export const KEY_SPEND_STOP_RATIO = 0.8;

export type KeySpend = { spend: number; maxBudget: number | null };

export type BudgetDecision =
  | { stop: false }
  | { stop: true; reason: 'per_measurement' | 'total' | 'key_budget'; message: string };

export function decideBudget(input: {
  perMeasurementCap: number;
  totalCap: number;
  /** Đã tiêu trong lần đo này (các lượt đã chạy). */
  measurementSpent: number;
  /** Tổng đã tiêu theo sổ (mọi lần đo trước đó, chưa gồm lần đo này). */
  ledgerSpent: number;
  /** Ước chi phí lượt kế tiếp (lấy bằng lượt vừa chạy). */
  nextRunEstimate: number;
  key: KeySpend | null;
}): BudgetDecision {
  const afterNext = input.measurementSpent + input.nextRunEstimate;
  if (afterNext > input.perMeasurementCap) {
    return {
      stop: true,
      reason: 'per_measurement',
      message: `Lần đo đã tiêu $${input.measurementSpent.toFixed(3)}, lượt kế tiếp ước $${input.nextRunEstimate.toFixed(3)} sẽ vượt trần $${input.perMeasurementCap}/lần đo.`,
    };
  }
  if (input.ledgerSpent + afterNext > input.totalCap) {
    return {
      stop: true,
      reason: 'total',
      message: `Tổng chi tiêu theo sổ $${input.ledgerSpent.toFixed(3)} + lần đo này sẽ vượt trần $${input.totalCap} của chuỗi việc.`,
    };
  }
  const { key } = input;
  if (
    key &&
    key.maxBudget !== null &&
    key.maxBudget > 0 &&
    key.spend / key.maxBudget > KEY_SPEND_STOP_RATIO
  ) {
    return {
      stop: true,
      reason: 'key_budget',
      message: `Khóa ảo LiteLLM đã tiêu $${key.spend.toFixed(2)} / $${key.maxBudget} (> ${KEY_SPEND_STOP_RATIO * 100}% trần).`,
    };
  }
  return { stop: false };
}

/** Cộng cột `usd` của sổ chi tiêu JSONL (mỗi dòng một lần đo); dòng hỏng/trống bị bỏ qua. */
export function sumLedger(jsonl: string): number {
  let total = 0;
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const usd = (JSON.parse(line) as { usd?: unknown }).usd;
      if (typeof usd === 'number' && Number.isFinite(usd)) total += usd;
    } catch {}
  }
  return total;
}

/** Chi tiêu + trần của khóa ảo đang dùng (LiteLLM `/key/info`); mọi lỗi → `null` (nơi gọi chỉ còn trần cấu hình). */
export async function readKeySpend(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
): Promise<KeySpend | null> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/key/info`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { info?: { spend?: unknown; max_budget?: unknown } };
    const spend = body.info?.spend;
    if (typeof spend !== 'number') return null;
    const max = body.info?.max_budget;
    return { spend, maxBudget: typeof max === 'number' ? max : null };
  } catch {
    return null;
  }
}
