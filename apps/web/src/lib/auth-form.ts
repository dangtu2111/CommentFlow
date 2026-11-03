import type { FieldProblem, SignInResult } from '@flow/saas-core';

/** Khóa chuỗi trong `auth.errors.*` (vi.json / en.json). Giao diện chỉ thấy các khóa này, không thấy mã lỗi thô. */
export const MESSAGE_KEYS = [
  'invalidCredentials',
  'emailNotVerified',
  'rateLimited',
  'twoFactorRequired',
  'emailInvalid',
  'passwordTooShort',
  'passwordTooLong',
  'passwordMismatch',
  'nameInvalid',
  'required',
  'generic',
] as const;
export type MessageKey = (typeof MESSAGE_KEYS)[number];

export type FieldName = 'email' | 'password' | 'passwordConfirm' | 'name';

/** Trạng thái form do Server Action trả về (đọc bằng `useActionState`). */
export type FormState =
  | { status: 'idle' }
  | { status: 'error'; message: MessageKey; field?: FieldName; values?: FormValues }
  | { status: 'sent' }
  /** Đăng nhập đúng nhưng email chưa xác minh: hiện nút gửi lại thư cho địa chỉ này. */
  | { status: 'unverified'; email: string };

/** Giá trị đã nhập (KHÔNG gồm mật khẩu) để điền lại ô sau khi form bị đặt lại. */
export type FormValues = { email?: string; name?: string };

export const IDLE: FormState = { status: 'idle' };

export function errorState(message: MessageKey, field?: FieldName, values?: FormValues): FormState {
  return {
    status: 'error',
    message,
    ...(field ? { field } : {}),
    ...(values ? { values } : {}),
  };
}

/** Lỗi nhập liệu của một trường → thông báo nói rõ cần sửa gì (docs/08 §6). */
export function problemToState(problem: FieldProblem, values?: FormValues): FormState {
  if (problem.field === 'email') return errorState('emailInvalid', 'email', values);
  if (problem.field === 'name') return errorState('nameInvalid', 'name', values);
  if (problem.reason === 'too_short') return errorState('passwordTooShort', 'password', values);
  if (problem.reason === 'too_long') return errorState('passwordTooLong', 'password', values);
  return errorState('generic', 'password', values);
}

/** Kết quả đăng nhập KHÔNG thành công → trạng thái form. Sai mật khẩu và email lạ dùng chung một thông báo. */
export function signInToState(
  result: Exclude<SignInResult, { status: 'ok' }>,
  email: string,
): FormState {
  const values = { email };
  switch (result.status) {
    case 'invalid_credentials':
      return errorState('invalidCredentials', undefined, values);
    case 'email_not_verified':
      return { status: 'unverified', email };
    case 'rate_limited':
      return errorState('rateLimited', undefined, values);
    case 'two_factor_required':
      return errorState('twoFactorRequired', undefined, values);
    case 'invalid':
      return problemToState(result.problem, values);
  }
}

/** `linh.nguyen@example.com` → `l***@example.com` (hiển thị ở trang "Kiểm tra email"). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
