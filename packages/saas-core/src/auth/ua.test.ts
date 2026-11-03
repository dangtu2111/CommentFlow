import { describe, expect, it } from 'vitest';
import { parseUserAgent } from './ua';

const CASES: Array<[string, string, { browser: string; os: string }]> = [
  [
    'Chrome trên Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    { browser: 'chrome', os: 'windows' },
  ],
  [
    'Edge trên Windows (chứa cả Chrome và Safari)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
    { browser: 'edge', os: 'windows' },
  ],
  [
    'Firefox trên Linux',
    'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
    { browser: 'firefox', os: 'linux' },
  ],
  [
    'Safari trên macOS',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    { browser: 'safari', os: 'macos' },
  ],
  [
    'Safari trên iPhone (chứa "Mac OS X")',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
    { browser: 'safari', os: 'ios' },
  ],
  [
    'Chrome trên Android (chứa "Linux")',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    { browser: 'chrome', os: 'android' },
  ],
  [
    'Chrome trên iOS (CriOS)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.0.0 Mobile/15E148 Safari/604.1',
    { browser: 'chrome', os: 'ios' },
  ],
  [
    'Opera',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0',
    { browser: 'opera', os: 'windows' },
  ],
  [
    'ChromeOS',
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    { browser: 'chrome', os: 'chromeos' },
  ],
];

describe('parseUserAgent', () => {
  it.each(CASES)('%s', (_name, ua, expected) => {
    expect(parseUserAgent(ua)).toEqual(expected);
  });

  it('thiếu / rỗng / lạ → other (không ném lỗi), cắt chuỗi quá dài', () => {
    expect(parseUserAgent(null)).toEqual({ browser: 'other', os: 'other' });
    expect(parseUserAgent(undefined)).toEqual({ browser: 'other', os: 'other' });
    expect(parseUserAgent('')).toEqual({ browser: 'other', os: 'other' });
    expect(parseUserAgent('curl/8.5.0')).toEqual({ browser: 'other', os: 'other' });
    expect(parseUserAgent(`${'A'.repeat(5000)} Firefox/1`).browser).toBe('other'); // phần sau 512 ký tự bị bỏ
  });
});
