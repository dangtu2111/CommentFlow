export type BrowserKind = 'edge' | 'opera' | 'firefox' | 'chrome' | 'safari' | 'other';
export type OsKind = 'windows' | 'macos' | 'ios' | 'android' | 'chromeos' | 'linux' | 'other';

/**
 * Nhận dạng tối thiểu từ `user_agent` để hiện "Chrome trên Windows" ở danh sách phiên. Tự viết (không thêm thư viện:
 * `ua-parser-js` bản 2.x giấy phép AGPL). Trả về MÃ (giao diện tự dịch), không phải chữ hiển thị.
 * Thứ tự kiểm quan trọng: Edge/Opera đều chứa "Chrome"; Chrome chứa "Safari"; iPhone/iPad chứa "Mac OS X"; Android chứa "Linux".
 */
export function parseUserAgent(userAgent: string | null | undefined): {
  browser: BrowserKind;
  os: OsKind;
} {
  const ua = (userAgent ?? '').slice(0, 512);
  let browser: BrowserKind = 'other';
  if (/\bEdg(e|A|iOS)?\//.test(ua)) browser = 'edge';
  else if (/\bOPR\/|\bOpera\b/.test(ua)) browser = 'opera';
  else if (/\bFirefox\/|\bFxiOS\//.test(ua)) browser = 'firefox';
  else if (/\bChrome\/|\bCriOS\//.test(ua)) browser = 'chrome';
  else if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) browser = 'safari';

  let os: OsKind = 'other';
  if (/\b(iPhone|iPad|iPod)\b/.test(ua)) os = 'ios';
  else if (/\bAndroid\b/.test(ua)) os = 'android';
  else if (/\bCrOS\b/.test(ua)) os = 'chromeos';
  else if (/\bWindows\b/.test(ua)) os = 'windows';
  else if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) os = 'macos';
  else if (/\bLinux\b|\bX11\b/.test(ua)) os = 'linux';
  return { browser, os };
}
