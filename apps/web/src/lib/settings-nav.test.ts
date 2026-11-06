import { describe, expect, it } from 'vitest';
import { getMessages } from '../i18n/messages';
import { settingsNavFor } from './settings-nav';

describe('UI-FIDELITY-SETTINGS-V2 điều hướng con của Cài đặt', () => {
  it('Owner thấy Kênh, Thành viên, Tài khoản & Bảo mật theo thứ tự thiết kế; Staff chỉ thấy Tài khoản & Bảo mật', () => {
    expect(settingsNavFor('owner').map((i) => i.key)).toEqual([
      'channels',
      'members',
      'billing',
      'notifications',
      'privacy',
      'security',
    ]);
    expect(settingsNavFor('staff').map((i) => i.key)).toEqual(['notifications', 'security']);
  });

  it('chỉ trỏ tới trang có thật (không mục chết)', () => {
    const hrefs = settingsNavFor('owner').map((i) => i.href);
    expect(hrefs).toEqual([
      '/app/channels',
      '/app/members',
      '/app/settings/billing',
      '/app/settings/notifications',
      '/app/settings/privacy',
      '/app/settings',
    ]);
  });

  it('mọi mục có nhãn settings.nav.<khóa> ở cả vi và en', () => {
    for (const locale of ['vi', 'en'] as const) {
      const nav = getMessages(locale).settings.nav as Record<string, string>;
      for (const item of settingsNavFor('owner')) {
        expect(nav[item.key], `${locale}:${item.key}`).toBeTruthy();
      }
    }
  });
});
