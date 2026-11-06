import { describe, expect, it } from 'vitest';
import { parseThemeChoice, THEME_COOKIE, THEME_INIT_SCRIPT, themeAttrFor } from './theme';

function runInit(cookie: string, prefersDark: boolean): string | undefined {
  let attr: string | undefined;
  const fake = {
    document: {
      cookie,
      documentElement: { setAttribute: (_k: string, v: string) => (attr = v) },
    },
    window: { matchMedia: () => ({ matches: prefersDark }) },
  };
  new Function('document', 'window', THEME_INIT_SCRIPT)(fake.document, fake.window);
  return attr;
}

describe('parseThemeChoice', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'system'],
    [undefined, 'system'],
    ['', 'system'],
    ['neon', 'system'],
    ['DARK', 'system'],
  ])('%j → %s', (input, expected) => {
    expect(parseThemeChoice(input)).toBe(expected);
  });
});

describe('themeAttrFor (máy chủ render sẵn để không nháy)', () => {
  it('sáng/tối đặt thẳng; theo hệ thống để script quyết định', () => {
    expect(themeAttrFor('light')).toBe('light');
    expect(themeAttrFor('dark')).toBe('dark');
    expect(themeAttrFor('system')).toBeUndefined();
  });
});

describe('THEME_INIT_SCRIPT (chạy trước khi vẽ)', () => {
  it('đọc đúng cookie', () => {
    expect(THEME_COOKIE).toBe('cf-theme');
    expect(THEME_INIT_SCRIPT).toContain('cf-theme');
  });
  it('cookie dark → tối; light → sáng, bất kể hệ thống', () => {
    expect(runInit('a=1; cf-theme=dark', false)).toBe('dark');
    expect(runInit('cf-theme=light', true)).toBe('light');
  });
  it('system hoặc không có cookie → theo prefers-color-scheme', () => {
    expect(runInit('cf-theme=system', true)).toBe('dark');
    expect(runInit('', true)).toBe('dark');
    expect(runInit('', false)).toBe('light');
  });
  it('cookie rác → như theo hệ thống', () => {
    expect(runInit('cf-theme=%3Cscript%3E', false)).toBe('light');
  });
});
