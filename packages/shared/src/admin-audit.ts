import { z } from 'zod';
import { AppError } from './errors';
import { maskPii } from './pii';

/**
 * Khung Admin phần DB (ADMIN-SHELL, FR-100/FR-118, AUTH-ADMIN-SESSION, Q-ADSH1): phiên quản trị 8 giờ và nhật ký thao tác
 * Admin. Lõi thuần (không DB, không mạng); hàm DB `core.require_admin_session` / `core.record_admin_action` (migration 0061)
 * lặp lại cùng quy tắc làm lớp phòng thủ thứ hai.
 */

export const ADMIN_ROLES = ['super', 'support', 'finance'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** docs/13 §2: phiên Admin hết hạn sau 8 giờ kể từ lúc tạo (trigger `core.cap_admin_session` ép ở DB). */
export const ADMIN_SESSION_MAX_MS = 8 * 3_600_000;

export type AdminSessionState = 'valid' | 'expired' | 'not_admin_session' | 'invalid';

export type AdminSessionInput = {
  isAdminSession: boolean;
  createdAt: Date;
  expiresAt: Date;
  now: Date;
};

/** Mốc lạ (NaN, tạo ở tương lai, hạn trước lúc tạo) → `invalid`; thiên về chặn. */
export function evaluateAdminSession(input: AdminSessionInput): AdminSessionState {
  const created = input.createdAt.getTime();
  const expires = input.expiresAt.getTime();
  const now = input.now.getTime();
  if (![created, expires, now].every(Number.isFinite) || created > now || expires <= created) {
    return 'invalid';
  }
  if (!input.isAdminSession) return 'not_admin_session';
  if (expires <= now || now - created >= ADMIN_SESSION_MAX_MS) return 'expired';
  return 'valid';
}

type AdminIdentity = { isAdmin: boolean; adminRole?: string | null };

const isAdminRole = (value: unknown): value is AdminRole =>
  typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);

/** Mọi vai trò Admin hợp lệ ghi được thao tác của mình vào nhật ký. */
export function canRecordAdminAction(user: AdminIdentity): boolean {
  return user.isAdmin === true && isAdminRole(user.adminRole);
}

/** Chỉ Super Admin đọc nhật ký Admin (docs/13 §3.2). */
export function canViewAdminAudit(user: AdminIdentity): boolean {
  return user.isAdmin === true && user.adminRole === 'super';
}

export const ADMIN_AUDIT_DETAIL_MAX_BYTES = 2000;
export const ADMIN_AUDIT_DETAIL_MAX_KEYS = 20;
const DETAIL_VALUE_MAX_CHARS = 200;
const REDACTED = '[đã che]';
const SENSITIVE_KEY = /pass|token|secret|otp|api[_-]?key|credential|cookie|authorization/i;
const OPAQUE = /[A-Za-z0-9_\-+/=.]{24,}/g;

const detailValue = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

const auditInputSchema = z.object({
  action: z.string().regex(/^[a-z][a-z0-9_.]{2,63}$/),
  targetType: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,39}$/)
    .nullable()
    .default(null),
  targetId: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,128}$/)
    .nullable()
    .default(null),
  targetWorkspaceId: z.uuid().nullable().default(null),
  detail: z
    .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/), detailValue)
    .refine((d) => Object.keys(d).length <= ADMIN_AUDIT_DETAIL_MAX_KEYS)
    .default({}),
});

export type AdminAuditInput = {
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetWorkspaceId: string | null;
  detail: Record<string, string | number | boolean | null>;
};

function sanitizeDetail(
  detail: Record<string, string | number | boolean | null>,
): AdminAuditInput['detail'] {
  const out: AdminAuditInput['detail'] = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
    } else if (typeof value === 'string') {
      out[key] = maskPii(value).replace(OPAQUE, '[ẩn]').slice(0, DETAIL_VALUE_MAX_CHARS);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Kiểm + làm sạch một dòng nhật ký Admin trước khi gửi DB. Người thực hiện, vai trò, phiên KHÔNG nằm trong đầu vào:
 * DB tự lấy từ phiên đã xác thực (không tin tham số). Che PII/token (bất biến #6); chỉ giá trị nguyên thủy, không lồng.
 */
export function parseAdminAuditInput(raw: unknown): AdminAuditInput {
  const parsed = auditInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Dữ liệu nhật ký thao tác Admin không hợp lệ.');
  }
  const detail = sanitizeDetail(parsed.data.detail);
  if (new TextEncoder().encode(JSON.stringify(detail)).length > ADMIN_AUDIT_DETAIL_MAX_BYTES) {
    throw new AppError('VALIDATION_FAILED', 'Chi tiết nhật ký thao tác Admin quá lớn.');
  }
  return { ...parsed.data, detail };
}
