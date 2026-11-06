import type { LeadStage } from '@flow/shared';
import { userInitials } from './user-initials';

/** Bốn cột Kanban theo thứ tự cố định (design/stitch/leads.html). */
export const LEAD_STAGES = [
  'new',
  'contacted',
  'won',
  'lost',
] as const satisfies readonly LeadStage[];

/** Gom lead theo giai đoạn: luôn đủ 4 khóa theo `LEAD_STAGES`, giữ thứ tự đầu vào. */
export function groupLeadsByStage<T extends { stage: LeadStage }>(
  rows: readonly T[],
): Record<LeadStage, T[]> {
  const grouped: Record<LeadStage, T[]> = { new: [], contacted: [], won: [], lost: [] };
  for (const row of rows) grouped[row.stage].push(row);
  return grouped;
}

/** SĐT chỉ hiển thị 4 số cuối (nguyên tắc #6). Không đúng 4 chữ số → null để không lộ nhầm dữ liệu khác. */
export function maskedPhone(last4: string | null): string | null {
  return last4 !== null && /^\d{4}$/.test(last4) ? `•••• ${last4}` : null;
}

export function leadInitials(name: string | null): string {
  return userInitials(name ?? '');
}
