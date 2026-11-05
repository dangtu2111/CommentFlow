/** Số cần xử lý theo workspace của bộ chuyển (FR-005). Thuần, không chạm DB. */

/** `id workspace → số`; `null` = không đọc được (không hiện nhãn, không làm hỏng khung). */
export type ActionableCounts = Record<string, number | null>;

const MAX_SHOWN = 99;

/** Nhãn hiển thị: 0/không có → không hiện; từ 100 trở lên → "99+". */
export function formatActionableCount(count: number | null | undefined): string | null {
  if (count == null || count <= 0) return null;
  return count > MAX_SHOWN ? `${MAX_SHOWN}+` : String(count);
}

/**
 * Đếm song song từng workspace bằng `countOne` (mỗi workspace một giao dịch `withActor` riêng — RLS cần ngữ cảnh từng
 * workspace). Một workspace lỗi chỉ cho `null` ở workspace đó.
 */
export async function collectActionableCounts(
  memberships: ReadonlyArray<{ id: string }>,
  countOne: (workspaceId: string) => Promise<number>,
): Promise<ActionableCounts> {
  const settled = await Promise.allSettled(memberships.map((m) => countOne(m.id)));
  const counts: ActionableCounts = {};
  memberships.forEach((m, index) => {
    const outcome = settled[index];
    counts[m.id] = outcome?.status === 'fulfilled' ? outcome.value : null;
  });
  return counts;
}
