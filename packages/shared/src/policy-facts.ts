import { z } from 'zod';
import { normalizeSearchText } from './search';

/**
 * Chính sách CÓ CẤU TRÚC (DRAFT-FACT-SLOTS, ADR 017): kiểm `policy_facts.data` bằng Zod ở MỌI ranh giới ghi/đọc. Một nguồn duy nhất cho giá trị cột `kind/status/origin` (DB có CHECK khớp).
 * Việc nhận ra tên tỉnh/thành của dòng ship nằm ở `@flow/ai` (từ điển tỉnh/thành); ở đây chỉ kiểm cấu trúc.
 */
export const POLICY_FACT_KINDS = ['ship_region', 'cod', 'returns', 'warranty', 'payment'] as const;
export type PolicyFactKind = (typeof POLICY_FACT_KINDS)[number];
export const POLICY_FACT_STATUSES = ['draft', 'approved'] as const;
export type PolicyFactStatus = (typeof POLICY_FACT_STATUSES)[number];
export const POLICY_FACT_ORIGINS = ['manual', 'shopify_suggested', 'text_suggested'] as const;
export type PolicyFactOrigin = (typeof POLICY_FACT_ORIGINS)[number];
export const PAYMENT_METHODS = ['cod', 'bank_transfer', 'card', 'installment', 'cash'] as const;

const name = z.string().trim().min(1).max(100);
const days = z.number().int().min(0).max(365).nullable();

const shipRegion = z
  .object({
    kind: z.enum(['nationwide', 'city', 'region']),
    label: name,
    /** BẮT BUỘC khi `kind = city` (nội thành phải ghi thành phố). */
    city: name.optional(),
    /** BẮT BUỘC (≥ 1) khi `kind = region`. */
    places: z.array(name).max(100).optional(),
    feeMinor: z.number().int().min(0).max(1_000_000_000_000).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    daysMin: days,
    daysMax: days,
    cod: z.boolean().nullable().optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.kind === 'city' && row.city === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['city'],
        message: 'Nội thành bắt buộc ghi thành phố.',
      });
    }
    if (row.kind === 'region' && (row.places ?? []).length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['places'],
        message: 'Vùng phải có ít nhất một tỉnh/thành.',
      });
    }
    if (row.daysMin !== null && row.daysMax !== null && row.daysMin > row.daysMax) {
      ctx.addIssue({
        code: 'custom',
        path: ['daysMax'],
        message: 'Số ngày tối đa nhỏ hơn tối thiểu.',
      });
    }
  });

const qualifier = z.string().trim().min(1).max(200);

/** Điều kiện/phạm vi chỉ CHÉP NGUYÊN VĂN từ `evidence` (kiểm chuỗi con ở nơi tạo đề xuất); `needsReview` = câu nguồn có điều kiện/phạm vi chưa tách được → Owner phải xem lại (không vào fact plan). */
const none = (field: 'days' | 'months', max: number, extra: z.ZodRawShape) =>
  z
    .object({
      [field]: z.number().int().min(0).max(max).nullable(),
      none: z.boolean().optional(),
      needsReview: z.boolean().optional(),
      ...extra,
    })
    .strict()
    .superRefine((value, ctx) => {
      const amount = (value as Record<string, number | null>)[field];
      const isNone = (value as { none?: boolean }).none === true;
      if (isNone && amount !== null) {
        ctx.addIssue({ code: 'custom', message: 'Ghi "không có" thì không kèm số.' });
      }
      if (!isNone && amount === null) {
        ctx.addIssue({ code: 'custom', message: 'Thiếu số (hoặc đánh dấu "không có").' });
      }
    });

const SCHEMAS = {
  ship_region: shipRegion,
  cod: z.object({ value: z.boolean() }).strict(),
  returns: none('days', 3650, { conditions: z.array(qualifier).max(10).optional() }),
  warranty: none('months', 600, { scope: qualifier.optional() }),
  payment: z.object({ methods: z.array(z.enum(PAYMENT_METHODS)).min(1).max(10) }).strict(),
} as const;

export type ShipRegionData = z.infer<typeof shipRegion>;

/** Kiểm `data` theo `kind`; loại lạ → thất bại. */
export function parsePolicyFactData(
  kind: string,
  data: unknown,
): { success: true; data: unknown } | { success: false } {
  if (!(POLICY_FACT_KINDS as readonly string[]).includes(kind)) return { success: false };
  const parsed = SCHEMAS[kind as PolicyFactKind].safeParse(data);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}

/** Định danh trong workspace: dòng ship = nhãn chuẩn hóa (≤ 100 ký tự); loại khác = chính `kind`. */
export function policySlotOf(kind: PolicyFactKind | string, data: { label?: string }): string {
  if (kind !== 'ship_region') return kind;
  return normalizeSearchText(data.label ?? '').slice(0, 100);
}
