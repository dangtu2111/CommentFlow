import { type ExtractedContacts, extractPii, type MaskedText, maskPii } from '@flow/shared';
import type { ExtractResult } from '../classify/extract-result';

/** Mã lỗi khi lưu liên hệ thất bại (không kèm nội dung/PII). */
export const PII_SAVE_FAILED = 'PII_CONTACT_SAVE_FAILED';

/**
 * Nơi lưu liên hệ gốc vào Khách tiềm năng (FR-033/FR-082). Interface: bản thật ghi DB qua
 * `withWorkspace` (cần bảng `leads` — `LEADS-KANBAN`, làn b).
 */
export interface ContactSink {
  save(
    workspaceId: string,
    contacts: ExtractedContacts,
    meta: { sourceId?: string },
  ): Promise<void>;
}

export interface MaskAndCaptureInput {
  readonly workspaceId: string;
  /** Mã bình luận/tin nhắn nguồn (để gắn Khách tiềm năng). */
  readonly sourceId?: string;
  readonly text: string;
}

export interface MaskAndCaptureResult {
  /** Văn bản ĐÃ che — chỉ bản này được đi tiếp tới LLM/Langfuse. */
  readonly masked: MaskedText;
  /** Liên hệ gốc; giữ trong bộ nhớ để điền `order_intent.phone`, KHÔNG log/gửi LLM. */
  readonly contacts: ExtractedContacts;
  readonly saved: boolean;
  readonly errorCode?: typeof PII_SAVE_FAILED;
}

/**
 * Lấy liên hệ từ văn bản gốc, LƯU trước, rồi mới trả bản đã che. Lưu lỗi vẫn trả bản đã che
 * (không bao giờ trả bản chưa che) với `saved:false` + mã lỗi để bên nối pipeline quyết định thử lại.
 */
export async function maskAndCapture(
  input: MaskAndCaptureInput,
  sink: ContactSink,
): Promise<MaskAndCaptureResult> {
  const contacts = extractPii(input.text);
  const masked = maskPii(input.text);
  if (contacts.phones.length === 0 && contacts.emails.length === 0) {
    return { masked, contacts, saved: true };
  }
  try {
    await sink.save(input.workspaceId, contacts, { sourceId: input.sourceId });
    return { masked, contacts, saved: true };
  } catch {
    // Không đính kèm lỗi gốc: thông báo của driver có thể chứa PII (nguyên tắc #6).
    return { masked, contacts, saved: false, errorCode: PII_SAVE_FAILED };
  }
}

type Masked<T> = T extends string ? MaskedText : T extends readonly (infer U)[] ? Masked<U>[] : T;

/** Che mọi chuỗi (và khóa) lồng trong giá trị trước khi gửi Langfuse/trace. */
export function maskForTrace<T>(value: T): Masked<T> {
  return maskDeep(value) as Masked<T>;
}

const UNSUPPORTED = '[unsupported]';
const CIRCULAR = '[circular]';

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function maskDeep(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return maskPii(value);
  if (typeof value === 'number' || typeof value === 'bigint') {
    // Số nguyên 84912345678 là SĐT: chỉ đổi sang chuỗi đã che khi thật sự bị che.
    const masked = maskPii(String(value));
    return masked === String(value) ? value : masked;
  }
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (ancestors.has(value)) return CIRCULAR;
  // Kiểu lạ (Map, Buffer, String bọc…) không đi qua được bộ che theo khóa → không để lọt nguyên.
  if (!Array.isArray(value) && !isPlainObject(value)) return UNSUPPORTED;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((v) => maskDeep(v, ancestors));
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [maskPii(k), maskDeep(v, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

/** Điền số thật (lấy trước khi che) vào `order_intent.phone`; LLM chỉ thấy bản che nên không biết số. */
export function fillOrderIntentPhone(
  result: ExtractResult,
  contacts: ExtractedContacts,
): ExtractResult {
  const phone = contacts.phones[0];
  if (!result.order_intent || phone === undefined) return result;
  return { ...result, order_intent: { ...result.order_intent, phone } };
}
