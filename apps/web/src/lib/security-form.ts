import type { ReauthResult } from '@flow/saas-core';
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
