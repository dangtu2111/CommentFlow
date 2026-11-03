import type { CookieSpec } from '@flow/saas-core';

/** Phần của `cookies()` trong Next mà ta cần (tách ra để test không cần Next). */
export type CookieJar = {
  set(cookie: {
    name: string;
    value: string;
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
  }): unknown;
};

/**
 * Đặt lại các cookie mà Better Auth trả về. Header `Set-Cookie` chứa giá trị ĐÃ mã hóa URL, còn `cookies().set`
 * của Next tự mã hóa lần nữa — nên phải giải mã trước để không bị mã hóa hai lần (sẽ làm hỏng chữ ký phiên).
 */
export function applyCookies(jar: CookieJar, specs: CookieSpec[]): void {
  for (const spec of specs) {
    jar.set({
      name: spec.name,
      value: safeDecode(spec.value),
      path: spec.path ?? '/',
      ...(spec.domain ? { domain: spec.domain } : {}),
      ...(spec.maxAge === undefined ? {} : { maxAge: spec.maxAge }),
      ...(spec.expires ? { expires: spec.expires } : {}),
      ...(spec.httpOnly ? { httpOnly: true } : {}),
      ...(spec.secure ? { secure: true } : {}),
      ...(spec.sameSite ? { sameSite: spec.sameSite } : {}),
    });
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
