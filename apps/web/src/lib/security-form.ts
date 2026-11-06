import type { ReauthResult } from '@flow/saas-core';
import { z } from 'zod';
import type { MessageKey } from './auth-form';

/** Trạng thái các form ở trang bảo mật (kết quả của Server Action, đọc bằng `useActionState`). */
export type SecurityState =
  | { status: 'idle' }
  | { status: 'error'; message: MessageKey; retryMinutes?: number }
  /** Đã qua bước mật khẩu: hiện QR + khóa nhập tay; mã dự phòng giữ ở máy người dùng đến khi xác nhận xong. */
  | { status: 'enroll'; qrDataUrl: string; manualKey: string; backupCodes: string[] }
  /** Mã dự phòng mới (sau khi bật xong hoặc tạo lại) — chỉ hiện một lần. */
  | { status: 'codes'; backupCodes: string[] }
  | { status: 'done' };

export const SECURITY_IDLE: SecurityState = { status: 'idle' };

export const securityError = (message: MessageKey, retryMinutes?: number): SecurityState => ({
  status: 'error',
  message,
  ...(retryMinutes ? { retryMinutes } : {}),
});

/** Giới hạn khớp saas-core (`MAX_PASSWORD_LENGTH` = 128; mã nhập tối đa 32 ký tự sau chuẩn hóa, cho dư khoảng trắng). */
const SECURITY_FIELDS = {
  password: { schema: z.string().min(1).max(128), error: 'wrongPassword' },
  code: { schema: z.string().min(1).max(64), error: 'invalidCode' },
  sessionId: { schema: z.uuid(), error: 'generic' },
} as const satisfies Record<string, { schema: z.ZodType<string>; error: MessageKey }>;

export type SecurityField = keyof typeof SECURITY_FIELDS;

export type SecurityInput =
  | { ok: true; value: string }
  | { ok: false; state: Extract<SecurityState, { status: 'error' }> };

/** Đọc + kiểm một trường của form bảo mật bằng Zod. Sai → trạng thái lỗi cho giao diện (không đoán, không ném lỗi). */
export function parseSecurityInput(field: SecurityField, data: FormData): SecurityInput {
  const { schema, error } = SECURITY_FIELDS[field];
  const parsed = schema.safeParse(data.get(field));
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, state: { status: 'error', message: error } };
}

/** Kết quả KHÔNG thành công của luồng xác nhận lại → trạng thái lỗi (không bao giờ lộ mã lỗi thô). */
export function reauthFailureToState(
  result: Exclude<ReauthResult<object>, { status: 'ok' }>,
): SecurityState {
  switch (result.status) {
    case 'wrong_password':
      return securityError('wrongPassword');
    case 'invalid_code':
      return securityError('invalidCode');
    case 'required':
      return securityError('twoFactorRequiredNoDisable');
    case 'rate_limited':
      return securityError('rateLimited', Math.max(1, Math.ceil(result.retryAfterSeconds / 60)));
    case 'already_enabled':
    case 'unauthenticated':
      return securityError('generic');
  }
}
