import en from '@flow/shared/messages/en.json';
import vi from '@flow/shared/messages/vi.json';
import { describe, expect, it } from 'vitest';

/** UI-AUTH (FR-001, 119): nội dung giao diện xác thực phải trung thực — thẻ minh họa luôn có nhãn [MẪU], không có huy hiệu/số liệu bịa. */
describe('FR-001 UI-AUTH nội dung trang xác thực', () => {
  const locales = { vi, en } as const;

  it.each(Object.keys(locales))('%s: thẻ minh họa gắn nhãn mẫu', (l) => {
    const demo = locales[l as 'vi' | 'en'].auth.demo;
    expect(demo.sample).toMatch(/^\[(MẪU|SAMPLE)\]$/);
    expect(demo.aria.length).toBeGreaterThan(0);
  });

  it.each(Object.keys(locales))('%s: không chứa huy hiệu/số liệu không có thật', (l) => {
    const text = JSON.stringify([
      locales[l as 'vi' | 'en'].auth.panel,
      locales[l as 'vi' | 'en'].auth.demo,
      locales[l as 'vi' | 'en'].auth.social,
    ]).toLowerCase();
    for (const fake of ['certified', '500+', '98.6', 'tech partner', 'google workspace']) {
      expect(text).not.toContain(fake);
    }
  });

  it.each(Object.keys(locales))('%s: nút Facebook có chú thích khi chưa mở', (l) => {
    const social = locales[l as 'vi' | 'en'].auth.social;
    expect(social.facebook.length).toBeGreaterThan(0);
    expect(social.unavailable.length).toBeGreaterThan(0);
  });

  it('khóa vi và en của demo/social khớp nhau', () => {
    expect(Object.keys(vi.auth.demo).sort()).toEqual(Object.keys(en.auth.demo).sort());
    expect(Object.keys(vi.auth.social).sort()).toEqual(Object.keys(en.auth.social).sort());
  });
});
