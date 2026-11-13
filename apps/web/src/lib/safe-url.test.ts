import { describe, expect, it } from 'vitest';
import { safeHttpsUrl, safeHttpUrl } from './safe-url';

describe('safeHttpUrl / safeHttpsUrl (dữ liệu nền tảng, không tin tuyệt đối)', () => {
  it('safeHttpUrl nhận http(s); safeHttpsUrl chỉ nhận https', () => {
    expect(safeHttpUrl('https://facebook.com/x?a=1')).toBe('https://facebook.com/x?a=1');
    expect(safeHttpUrl('http://facebook.com/x')).toBe('http://facebook.com/x');
    expect(safeHttpsUrl('https://scontent.xx.fbcdn.net/a.jpg')).toBe(
      'https://scontent.xx.fbcdn.net/a.jpg',
    );
    expect(safeHttpsUrl('http://facebook.com/x')).toBeNull();
  });

  it('javascript:, data:, ftp:, chuỗi lạ, rỗng, null → null', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://x/y',
      'khong-phai-url',
      '',
      null,
      undefined,
    ]) {
      expect(safeHttpUrl(bad), String(bad)).toBeNull();
      expect(safeHttpsUrl(bad), String(bad)).toBeNull();
    }
  });
});
