/** Một cookie đã tách từ header `Set-Cookie`, để nơi gọi (Next.js) tự đặt lại bằng API của framework. */
export type CookieSpec = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
};

/** Tách một header `Set-Cookie` (đúng một cookie). Trả null nếu không đọc được. */
export function parseSetCookie(header: string): CookieSpec | null {
  const [pair, ...attributes] = header.split(';').map((part) => part.trim());
  const eq = pair?.indexOf('=') ?? -1;
  if (!pair || eq <= 0) return null;
  const cookie: CookieSpec = { name: pair.slice(0, eq), value: pair.slice(eq + 1) };
  for (const attribute of attributes) {
    const separator = attribute.indexOf('=');
    const key = (separator === -1 ? attribute : attribute.slice(0, separator)).toLowerCase();
    const value = separator === -1 ? '' : attribute.slice(separator + 1);
    switch (key) {
      case 'path':
        cookie.path = value;
        break;
      case 'domain':
        cookie.domain = value;
        break;
      case 'max-age': {
        const seconds = Number(value);
        if (Number.isFinite(seconds)) cookie.maxAge = seconds;
        break;
      }
      case 'expires': {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) cookie.expires = date;
        break;
      }
      case 'httponly':
        cookie.httpOnly = true;
        break;
      case 'secure':
        cookie.secure = true;
        break;
      case 'samesite': {
        const mode = value.toLowerCase();
        if (mode === 'lax' || mode === 'strict' || mode === 'none') cookie.sameSite = mode;
        break;
      }
      default:
        break;
    }
  }
  return cookie;
}

/** Mọi cookie trong phản hồi của Better Auth (giá trị giữ nguyên dạng đã mã hóa URL). */
export function cookiesFromResponse(response: Response): CookieSpec[] {
  return response.headers
    .getSetCookie()
    .map(parseSetCookie)
    .filter((cookie): cookie is CookieSpec => cookie !== null);
}
