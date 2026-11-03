import { LOCALE_COOKIE, type Locale } from '@flow/shared';
import type { CookieJar } from './apply-cookies';

/** Lưu ngôn ngữ vào cookie (URL không có tiền tố /vi /en) — dùng chung cho bộ chọn và lúc đăng nhập. */
export function setLocaleCookie(jar: CookieJar, locale: Locale): void {
  jar.set({
    name: LOCALE_COOKIE,
    value: locale,
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
}
