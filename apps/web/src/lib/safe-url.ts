/**
 * Kiểm URL từ dữ liệu nền tảng trước khi đưa vào `href`/`src` (không tin tuyệt đối). `safeHttpUrl` nhận http(s) (liên kết bài gốc); `safeHttpsUrl` chỉ https (ảnh: CSP `img-src`
 * chỉ cho https). Sai/lạ (`javascript:`, `data:`…) → `null`.
 */
function protocolOf(url: string | null | undefined): { href: string; protocol: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return { href: parsed.href, protocol: parsed.protocol };
  } catch {
    return null;
  }
}

export function safeHttpUrl(url: string | null | undefined): string | null {
  const parsed = protocolOf(url);
  return parsed && (parsed.protocol === 'https:' || parsed.protocol === 'http:')
    ? parsed.href
    : null;
}

export function safeHttpsUrl(url: string | null | undefined): string | null {
  const parsed = protocolOf(url);
  return parsed && parsed.protocol === 'https:' ? parsed.href : null;
}
