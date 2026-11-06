import type { ChangePasswordResult } from '@flow/saas-core';
import { z } from 'zod';
import type { MessageKey } from './auth-form';
import { type SecurityState, securityError } from './security-form';

/** Chặn chuỗi khổng lồ ở ranh giới; giới hạn thật 10–128 ký tự do saas-core kiểm (một nguồn). */
const RAW_MAX = 1024;

const fieldSchema = z.string().min(1);
const formSchema = z.object({
  currentPassword: fieldSchema,
  newPassword: fieldSchema,
  confirmPassword: z.string(),
});

export type ChangePasswordInput =
  | { ok: true; currentPassword: string; newPassword: string }
  | { ok: false; message: MessageKey };

/** Đọc form đổi mật khẩu. Không bao giờ đưa mật khẩu vào kết quả lỗi. */
export function parseChangePasswordForm(data: FormData): ChangePasswordInput {
  const raw = Object.fromEntries(
    ['currentPassword', 'newPassword', 'confirmPassword'].map((key) => [key, data.get(key) ?? '']),
  );
  const parsed = formSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'required' };
  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword.length > RAW_MAX || currentPassword.length > RAW_MAX) {
    return { ok: false, message: 'passwordTooLong' };
  }
  if (newPassword !== confirmPassword) return { ok: false, message: 'passwordMismatch' };
  return { ok: true, currentPassword, newPassword };
}

/** Kết quả KHÔNG thành công (`ok` và `unauthenticated` do Server Action xử lý bằng chuyển trang). */
export function changePasswordToState(
  result: Exclude<ChangePasswordResult, { status: 'ok' | 'unauthenticated' }>,
): SecurityState {
  switch (result.status) {
    case 'wrong_password':
      return securityError('wrongPassword');
    case 'same_password':
      return securityError('passwordSame');
    case 'rate_limited':
      return securityError('rateLimited', Math.max(1, Math.ceil(result.retryAfterSeconds / 60)));
    case 'invalid':
      switch (result.reason) {
        case 'too_short':
          return securityError('passwordTooShort');
        case 'too_long':
          return securityError('passwordTooLong');
        case 'common':
          return securityError('passwordCommon');
        case 'pwned':
          return securityError('passwordPwned');
      }
  }
}
