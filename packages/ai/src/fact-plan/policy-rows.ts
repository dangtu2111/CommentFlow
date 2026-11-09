import { parsePolicyFactData, type ShipRegionData } from '@flow/shared';
import type { PolicyFacts, ShipRow } from './types';

/**
 * Dòng `cf.policy_facts` ĐÃ DUYỆT → `PolicyFacts` của fact plan (ADR 017). Chỉ nhận `status = 'approved'` (bản nháp KHÔNG vào, kể cả khi truyền nhầm); `data` kiểm lại bằng Zod ở ranh giới đọc;
 * dòng hỏng/loại lạ bị bỏ và ghi vào `issues` (không đoán). Nguồn của mỗi sự kiện là `pf:<id dòng>`.
 */
export type PolicyFactInputRow = { id: string; kind: string; data: unknown; status: string };

export function policyFactsFromRows(rows: readonly PolicyFactInputRow[]): {
  policy: PolicyFacts;
  issues: string[];
} {
  const policy: PolicyFacts = { shipping: [] };
  const issues: string[] = [];
  for (const row of rows) {
    if (row.status !== 'approved') continue;
    const sourceId = `pf:${row.id}`;
    const parsed = parsePolicyFactData(row.kind, row.data);
    if (parsed.success && (parsed.data as { needsReview?: boolean }).needsReview === true) {
      issues.push(
        `Chính sách ${sourceId} (${row.kind}): còn điều kiện/phạm vi chờ Owner xem lại — bỏ qua.`,
      );
      continue;
    }
    if (!parsed.success) {
      issues.push(`Chính sách ${sourceId} (${row.kind}): dữ liệu không hợp lệ — bỏ qua.`);
      continue;
    }
    switch (row.kind) {
      case 'ship_region': {
        const d = parsed.data as ShipRegionData;
        const shipRow: ShipRow = {
          kind: d.kind,
          label: d.label,
          ...(d.city === undefined ? {} : { city: d.city }),
          ...(d.places === undefined ? {} : { places: d.places }),
          feeMinor: d.feeMinor,
          currency: d.currency,
          daysMin: d.daysMin,
          daysMax: d.daysMax,
          ...(d.cod === undefined ? {} : { cod: d.cod }),
          ...(d.feeMode === undefined ? {} : { feeMode: d.feeMode }),
          ...(d.freeOverMinor === undefined ? {} : { freeOverMinor: d.freeOverMinor }),
          ...(d.daysMode === undefined ? {} : { daysMode: d.daysMode }),
          ...(d.destinations === undefined ? {} : { destinations: d.destinations }),
          sourceId,
        };
        policy.shipping.push(shipRow);
        break;
      }
      case 'cod':
        policy.cod = { value: (parsed.data as { value: boolean }).value, sourceId };
        break;
      case 'returns': {
        const d = parsed.data as {
          days: number | null;
          none?: boolean;
          conditions?: string[];
          refundTo?: 'original_payment' | null;
          returnShippingPaidBy?: 'customer_change_of_mind' | 'shop' | null;
          eligibility?: 'varies_by_item' | null;
        };
        policy.returns = {
          days: d.days,
          none: d.none === true,
          ...(d.conditions ? { conditions: d.conditions } : {}),
          ...(d.refundTo ? { refundTo: d.refundTo } : {}),
          ...(d.returnShippingPaidBy ? { returnShippingPaidBy: d.returnShippingPaidBy } : {}),
          ...(d.eligibility ? { eligibility: d.eligibility } : {}),
          sourceId,
        };
        break;
      }
      case 'warranty': {
        const d = parsed.data as { months: number | null; none?: boolean; scope?: string };
        policy.warranty = {
          months: d.months,
          none: d.none === true,
          ...(d.scope ? { scope: d.scope } : {}),
          sourceId,
        };
        break;
      }
      default:
        policy.payment = { methods: (parsed.data as { methods: string[] }).methods, sourceId };
    }
  }
  return { policy, issues };
}
