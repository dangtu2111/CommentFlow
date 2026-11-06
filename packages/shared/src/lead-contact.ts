import { z } from 'zod';
import type { ExtractedContacts } from './pii';

/**
 * Quy tắc thuần cho Khách tiềm năng (FR-082, FR-033, docs/10 §3.5 `leads`): chuẩn hóa liên hệ, lập lead từ liên hệ đã
 * tách (PII-MASK-PIPE), kiểm cập nhật Kanban. Không đụng DB/mã hóa (xem `packages/db/src/lead-vault.ts`).
 * Dữ liệu ở đây là PII: không log, không đưa vào thông báo lỗi.
 */
export const LEAD_STAGES = ['new', 'contacted', 'won', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Một lần lưu liên hệ tạo tối đa chừng này lead (chống một bình luận bơm hàng loạt số). */
export const LEAD_MAX_PER_CAPTURE = 3;
export const LEAD_NAME_MAX = 120;
export const LEAD_NOTE_MAX = 500;
const EMAIL_MAX = 254;

const MOBILE = /^0[35789]\d{8}$/;
// Cùng mức nông với `pii.ts` (không cố bắt hết RFC 5322): một @, miền có dấu chấm, không khoảng trắng.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** SĐT di động Việt Nam về dạng `0xxxxxxxxx`; `null` nếu sai độ dài/đầu số. */
export function normalizeLeadPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('84') ? `0${digits.slice(2)}` : digits;
  return MOBILE.test(local) ? local : null;
}

/** Email chữ thường, cắt khoảng trắng; `null` nếu sai dạng hoặc quá 254 ký tự. */
export function normalizeLeadEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= EMAIL_MAX && EMAIL.test(email) ? email : null;
}

/** 4 số cuối của SĐT đã chuẩn hóa (cột `phone_last4`, dùng để hiển thị/tìm nhanh). */
export function phoneLast4(normalizedPhone: string): string {
  return normalizedPhone.slice(-4);
}

/** Gợi ý hiển thị khi chưa/không được xem số đầy đủ. */
export function maskedPhoneHint(last4: string): string {
  return `••••••${last4}`;
}

export type LeadContactDraft = { readonly phone: string | null; readonly email: string | null };

function uniqueNormalized(
  values: readonly string[],
  normalize: (raw: string) => string | null,
): string[] {
  return [...new Set(values.flatMap((v) => normalize(v) ?? []))];
}

/**
 * Lập danh sách lead từ liên hệ gốc: có SĐT → mỗi SĐT một lead, email đầu tiên gắn vào lead đầu; chỉ có email → mỗi
 * email một lead. Liên hệ sai dạng/trùng bị bỏ; tối đa `LEAD_MAX_PER_CAPTURE` lead.
 */
export function planLeadsFromContacts(contacts: ExtractedContacts): LeadContactDraft[] {
  const phones = uniqueNormalized(contacts.phones, normalizeLeadPhone);
  const emails = uniqueNormalized(contacts.emails, normalizeLeadEmail);
  const drafts: LeadContactDraft[] =
    phones.length > 0
      ? phones.map((phone, i) => ({ phone, email: i === 0 ? (emails[0] ?? null) : null }))
      : emails.map((email) => ({ phone: null, email }));
  return drafts.slice(0, LEAD_MAX_PER_CAPTURE);
}

/** Cập nhật lead từ giao diện Kanban: chỉ giai đoạn/tên/ghi chú/người được giao; trường thừa bị từ chối. */
export const leadUpdateSchema = z
  .object({
    stage: z.enum(LEAD_STAGES),
    name: z.string().trim().max(LEAD_NAME_MAX).nullable(),
    note: z.string().max(LEAD_NOTE_MAX).nullable(),
    assignedTo: z.uuid().nullable(),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Không có gì để cập nhật' });

export type LeadUpdate = z.infer<typeof leadUpdateSchema>;

export function parseLeadUpdate(input: unknown) {
  return leadUpdateSchema.safeParse(input);
}
