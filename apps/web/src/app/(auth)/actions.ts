'use server';

import { isLocale, type Locale } from '@flow/shared';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { applyCookies } from '../../lib/apply-cookies';
import { errorState, type FormState, problemToState, signInToState } from '../../lib/auth-form';
import { setLocaleCookie } from '../../lib/locale-cookie';
import { PENDING_EMAIL_COOKIE } from '../../lib/pending-email';
import { getAuthRuntime } from '../../server/auth';
import { requestContext } from '../../server/request-context';

/**
 * Server Action của các trang xác thực. Chỉ làm 3 việc: đọc form, gọi `flows` của saas-core, đổi kết quả thành
 * trạng thái cho giao diện. Mọi kết quả đã trung tính về việc email có tồn tại hay không (xem flows.ts).
 */

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

export async function loginAction(_previous: FormState, data: FormData): Promise<FormState> {
  const email = text(data, 'email');
  const { ip, headers: requestHeaders } = await requestContext();
  const result = await getAuthRuntime().flows.signIn({
    email,
    password: text(data, 'password'),
    headers: requestHeaders,
    ...(ip ? { ip } : {}),
  });
  if (result.status === 'two_factor_required') {
    // Mật khẩu đúng nhưng CHƯA có phiên: chỉ đặt cookie chờ (plugin + cookie ký của ta) rồi sang bước nhập mã.
    applyCookies(await cookies(), result.cookies);
    redirect('/login/2fa');
  }
  if (result.status !== 'ok') return signInToState(result, email.trim());

  const jar = await cookies();
  applyCookies(jar, result.cookies);
  setLocaleCookie(jar, result.locale);
  jar.delete(PENDING_EMAIL_COOKIE); // đã xong bước xác minh/đăng nhập: không giữ email tạm
  redirect('/app');
}

/** Bước 2 của đăng nhập: nhập mã TOTP hoặc mã dự phòng. Chỉ khi mã đúng mới có phiên. */
export async function verifyTwoFactorAction(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const kind = text(data, 'kind') === 'backup' ? 'backup' : 'totp';
  const { headers: requestHeaders } = await requestContext();
  const result = await getAuthRuntime().twoFactor.verifyLogin({
    code: text(data, 'code'),
    kind,
    headers: requestHeaders,
  });
  switch (result.status) {
    case 'invalid_code':
      return errorState(kind === 'backup' ? 'invalidBackupCode' : 'invalidCode');
    case 'rate_limited':
      return {
        ...errorState('rateLimited'),
        retryMinutes: Math.max(1, Math.ceil(result.retryAfterSeconds / 60)),
      } as FormState;
    case 'expired': {
      redirect('/login');
      break;
    }
    case 'ok': {
      const jar = await cookies();
      applyCookies(jar, result.cookies);
      setLocaleCookie(jar, result.locale);
      jar.delete(PENDING_EMAIL_COOKIE);
      redirect('/app');
    }
  }
}

export async function registerAction(_previous: FormState, data: FormData): Promise<FormState> {
  const email = text(data, 'email');
  const name = text(data, 'name');
  const locale: Locale = await getLocale().then((value) => (isLocale(value) ? value : 'vi'));
  const { ip } = await requestContext();
  const result = await getAuthRuntime().flows.register({
    email,
    name,
    password: text(data, 'password'),
    locale,
    ...(ip ? { ip } : {}),
  });
  if (result.status === 'invalid') return problemToState(result.problem, { email, name });

  (await cookies()).set({
    name: PENDING_EMAIL_COOKIE,
    value: email.trim().toLowerCase(),
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 60,
    secure: process.env.NODE_ENV === 'production',
  });
  redirect('/check-email');
}

/** Gửi lại thư xác minh (từ trang "Kiểm tra email" hoặc sau khi đăng nhập báo chưa xác minh). */
export async function resendVerificationAction(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const { ip } = await requestContext();
  const result = await getAuthRuntime().flows.resendVerification({
    email: text(data, 'email'),
    ...(ip ? { ip } : {}),
  });
  return result.status === 'invalid' ? problemToState(result.problem) : { status: 'sent' };
}

export async function forgotPasswordAction(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const email = text(data, 'email');
  const { ip } = await requestContext();
  const result = await getAuthRuntime().flows.requestPasswordReset({
    email,
    ...(ip ? { ip } : {}),
  });
  return result.status === 'invalid'
    ? problemToState(result.problem, { email })
    : { status: 'sent' };
}

export async function resetPasswordAction(
  _previous: FormState,
  data: FormData,
): Promise<FormState> {
  const password = text(data, 'password');
  if (password !== text(data, 'passwordConfirm')) {
    return errorState('passwordMismatch', 'passwordConfirm');
  }
  const result = await getAuthRuntime().flows.resetPassword({
    token: text(data, 'token'),
    newPassword: password,
  });
  if (result.status === 'invalid') return problemToState(result.problem);
  if (result.status === 'invalid_token') redirect('/reset-password?error=INVALID_TOKEN');
  redirect('/login?reset=1');
}

export async function logoutAction(): Promise<void> {
  const cleared = await getAuthRuntime().flows.signOut(await headers());
  applyCookies(await cookies(), cleared);
  redirect('/login?loggedOut=1');
}
