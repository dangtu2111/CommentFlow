type JarEntry = { name: string; value: string };

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Dựng header `Cookie` theo kho cookie HIỆN TẠI của Next (`cookies()`), không theo header thô của request.
 * Sau khi một Server Action đặt cookie (vd. xoay phiên khi bật 2FA), Next dựng lại trang ngay trong cùng request,
 * nhưng `headers()` vẫn là header cũ → trang thấy phiên đã bị xóa và chuyển về /login. Cookie không đổi giữ
 * nguyên chuỗi gốc (không mã hóa lại); cookie đổi/mới được mã hóa URL; cookie đã xóa bị bỏ.
 */
export function cookieHeaderFromJar(rawHeader: string | null, jar: JarEntry[]): string {
  const rawByName = new Map<string, string>();
  for (const part of (rawHeader ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) rawByName.set(name, rest.join('='));
  }
  return jar
    .map(({ name, value }) => {
      const raw = rawByName.get(name);
      return `${name}=${raw !== undefined && decode(raw) === value ? raw : encodeURIComponent(value)}`;
    })
    .join('; ');
}
