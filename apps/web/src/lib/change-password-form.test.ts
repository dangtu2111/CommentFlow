import { describe, expect, it } from 'vitest';
import { changePasswordToState, parseChangePasswordForm } from './change-password-form';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe('FR-001 form đổi mật khẩu — đọc và kiểm đầu vào (Zod)', () => {
  it('hợp lệ → trả mật khẩu hiện tại và mật khẩu mới', () => {
    expect(
      parseChangePasswordForm(
        form({ currentPassword: 'cu', newPassword: 'moi-moi-moi', confirmPassword: 'moi-moi-moi' }),
      ),
    ).toEqual({ ok: true, currentPassword: 'cu', newPassword: 'moi-moi-moi' });
  });

  it('thiếu mật khẩu hiện tại hoặc mật khẩu mới → required', () => {
    for (const fields of [
      {},
      { currentPassword: '', newPassword: 'abc', confirmPassword: 'abc' },
      { currentPassword: 'cu', newPassword: '', confirmPassword: '' },
    ] as Record<string, string>[]) {
      expect(parseChangePasswordForm(form(fields))).toEqual({ ok: false, message: 'required' });
    }
  });

  it('ô nhập lại không khớp → passwordMismatch', () => {
    expect(
      parseChangePasswordForm(
        form({ currentPassword: 'cu', newPassword: 'moi-moi-moi', confirmPassword: 'khac' }),
      ),
    ).toEqual({ ok: false, message: 'passwordMismatch' });
  });

  it('chuỗi cực dài (> 1024) bị chặn trước khi chạm saas-core', () => {
    const long = 'a'.repeat(1025);
    expect(
      parseChangePasswordForm(
        form({ currentPassword: 'cu', newPassword: long, confirmPassword: long }),
      ),
    ).toEqual({ ok: false, message: 'passwordTooLong' });
  });

  it('giá trị không phải chuỗi (tệp) → required', () => {
    const data = new FormData();
    data.set('currentPassword', new Blob(['x']), 'f.txt');
    data.set('newPassword', 'moi-moi-moi');
    data.set('confirmPassword', 'moi-moi-moi');
    expect(parseChangePasswordForm(data)).toEqual({ ok: false, message: 'required' });
  });
});

describe('FR-001 kết quả đổi mật khẩu → trạng thái giao diện', () => {
  it('ánh xạ từng trạng thái KHÔNG thành công sang khóa chuỗi, không lộ mã thô', () => {
    expect(changePasswordToState({ status: 'wrong_password' })).toEqual({
      status: 'error',
      message: 'wrongPassword',
    });
    expect(changePasswordToState({ status: 'same_password' })).toEqual({
      status: 'error',
      message: 'passwordSame',
    });
    expect(changePasswordToState({ status: 'invalid', reason: 'too_short' })).toEqual({
      status: 'error',
      message: 'passwordTooShort',
    });
    expect(changePasswordToState({ status: 'invalid', reason: 'too_long' })).toEqual({
      status: 'error',
      message: 'passwordTooLong',
    });
    expect(changePasswordToState({ status: 'invalid', reason: 'common' })).toEqual({
      status: 'error',
      message: 'passwordCommon',
    });
    expect(changePasswordToState({ status: 'invalid', reason: 'pwned' })).toEqual({
      status: 'error',
      message: 'passwordPwned',
    });
  });

  it('rate_limited → số phút làm tròn lên, tối thiểu 1', () => {
    expect(changePasswordToState({ status: 'rate_limited', retryAfterSeconds: 61 })).toEqual({
      status: 'error',
      message: 'rateLimited',
      retryMinutes: 2,
    });
    expect(changePasswordToState({ status: 'rate_limited', retryAfterSeconds: 1 })).toMatchObject({
      retryMinutes: 1,
    });
  });
});
