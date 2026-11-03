import { describe, expect, it } from 'vitest';
import { parseWorkspaceForm } from './workspace-form';

const ok = { name: '  Shop An  ', timezone: 'Asia/Ho_Chi_Minh', defaultLang: 'en' };

describe('parseWorkspaceForm', () => {
  it('chuẩn hóa tên (cắt khoảng trắng) và nhận ngôn ngữ hợp lệ', () => {
    expect(parseWorkspaceForm(ok)).toEqual({
      ok: true,
      name: 'Shop An',
      timezone: 'Asia/Ho_Chi_Minh',
      defaultLang: 'en',
    });
  });
  it('tên rỗng/chỉ khoảng trắng/quá 80 ký tự/không phải chuỗi → nameInvalid', () => {
    for (const name of ['', '   ', 'x'.repeat(81), undefined, 5]) {
      expect(parseWorkspaceForm({ ...ok, name })).toMatchObject({
        ok: false,
        message: 'nameInvalid',
      });
    }
  });
  it('múi giờ ngoài danh sách → timezoneInvalid', () => {
    for (const timezone of ['Mars/Olympus', '', undefined])
      expect(parseWorkspaceForm({ ...ok, timezone })).toMatchObject({
        ok: false,
        message: 'timezoneInvalid',
      });
  });
  it('ngôn ngữ lạ rơi về mặc định vi (không tin client)', () => {
    expect(parseWorkspaceForm({ ...ok, defaultLang: 'fr' })).toMatchObject({
      ok: true,
      defaultLang: 'vi',
    });
  });
  it('giữ lại giá trị đã nhập khi lỗi để điền lại form', () => {
    expect(parseWorkspaceForm({ ...ok, name: '' })).toMatchObject({
      ok: false,
      values: { timezone: 'Asia/Ho_Chi_Minh', defaultLang: 'en' },
    });
  });
});
