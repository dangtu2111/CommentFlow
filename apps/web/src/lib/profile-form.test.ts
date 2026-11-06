import { describe, expect, it } from 'vitest';
import { parseProfileForm, PROFILE_NAME_MAX, timezoneLabel } from './profile-form';

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

describe('parseProfileForm', () => {
  it('nhận tên + múi giờ hợp lệ, cắt khoảng trắng', () => {
    expect(parseProfileForm(form({ name: '  Nguyễn Mai Linh ', timezone: 'Asia/Ho_Chi_Minh' }))).toEqual({
      ok: true,
      value: { name: 'Nguyễn Mai Linh', timezone: 'Asia/Ho_Chi_Minh' },
    });
  });

  it('thiếu/rỗng tên → required (thông báo "Vui lòng nhập họ tên")', () => {
    expect(parseProfileForm(form({ name: '   ', timezone: 'UTC' }))).toEqual({
      ok: false,
      errors: { name: 'required' },
    });
    expect(parseProfileForm(form({ timezone: 'UTC' }))).toMatchObject({ ok: false });
  });

  it(`tên quá ${PROFILE_NAME_MAX} ký tự → too_long`, () => {
    expect(
      parseProfileForm(form({ name: 'a'.repeat(PROFILE_NAME_MAX + 1), timezone: 'UTC' })),
    ).toEqual({ ok: false, errors: { name: 'too_long' } });
  });

  it('múi giờ ngoài danh sách → invalid', () => {
    expect(parseProfileForm(form({ name: 'A', timezone: 'Mars/Olympus' }))).toEqual({
      ok: false,
      errors: { timezone: 'invalid' },
    });
  });

  it('email/SĐT/vai trò do client gửi bị bỏ qua (không bao giờ vào giá trị lưu)', () => {
    const result = parseProfileForm(
      form({ name: 'A', timezone: 'UTC', email: 'x@y.z', phone: '0912345678', role: 'owner' }),
    );
    expect(result).toEqual({ ok: true, value: { name: 'A', timezone: 'UTC' } });
  });
});

describe('timezoneLabel', () => {
  it('có độ lệch GMT và tên vùng', () => {
    const label = timezoneLabel('Asia/Ho_Chi_Minh');
    expect(label).toContain('+07:00');
    expect(label).toContain('Ho Chi Minh');
  });
  it('UTC', () => {
    expect(timezoneLabel('UTC')).toContain('UTC');
  });
});
