import { flattenMessages } from '@flow/shared';
import en from '@flow/shared/messages/en.json';
import vi from '@flow/shared/messages/vi.json';
import { describe, expect, it } from 'vitest';
import { MESSAGE_KEYS, maskEmail, problemToState, signInToState } from './auth-form';

describe('chuỗi thông báo xác thực', () => {
  it('mọi khóa lỗi có đủ trong vi.json và en.json', () => {
    for (const messages of [vi, en]) {
      const flat = flattenMessages(messages);
      for (const key of MESSAGE_KEYS) expect(flat[`auth.errors.${key}`], key).toBeTruthy();
    }
  });

  it('không câu nào trong phần auth tiết lộ email có tồn tại hay không', () => {
    const leaky =
      /không tồn tại|chưa đăng ký|chưa có tài khoản|không tìm thấy|not found|does not exist|doesn't exist|no account|isn't registered|not registered/i;
    for (const messages of [vi, en]) {
      for (const [key, text] of Object.entries(flattenMessages(messages.auth))) {
        expect(text, key).not.toMatch(leaky);
      }
    }
  });

  it('thông báo sau "quên mật khẩu" và "gửi lại thư" đều có điều kiện "nếu" (không khẳng định đã gửi cho tài khoản)', () => {
    expect(vi.auth.forgot.sent).toMatch(/^Nếu /);
    expect(en.auth.forgot.sent).toMatch(/^If /);
    expect(vi.auth.checkEmail.resent).toContain('nếu địa chỉ hợp lệ');
    expect(en.auth.checkEmail.resent).toContain('if the address is valid');
  });
});

describe('signInToState', () => {
  it('sai mật khẩu và email lạ dùng chung một thông báo (cùng trạng thái)', () => {
    expect(signInToState({ status: 'invalid_credentials' }, 'a@example.test')).toEqual({
      status: 'error',
      message: 'invalidCredentials',
      values: { email: 'a@example.test' },
    });
  });

  it('chưa xác minh → trạng thái unverified kèm email để gửi lại thư', () => {
    expect(signInToState({ status: 'email_not_verified' }, 'a@example.test')).toEqual({
      status: 'unverified',
      email: 'a@example.test',
    });
  });

  it('các nhánh chừa chỗ cho nhánh sau (rate limit, 2FA) đã có thông báo', () => {
    expect(signInToState({ status: 'rate_limited' }, 'a@example.test')).toMatchObject({
      message: 'rateLimited',
    });
    expect(signInToState({ status: 'two_factor_required' }, 'a@example.test')).toMatchObject({
      message: 'twoFactorRequired',
    });
  });
});

describe('problemToState', () => {
  it('ánh xạ từng lỗi trường sang khóa thông báo và trường cần đánh dấu', () => {
    expect(problemToState({ field: 'email', reason: 'invalid' })).toEqual({
      status: 'error',
      message: 'emailInvalid',
      field: 'email',
    });
    expect(problemToState({ field: 'password', reason: 'too_short' })).toMatchObject({
      message: 'passwordTooShort',
      field: 'password',
    });
    expect(problemToState({ field: 'password', reason: 'too_long' })).toMatchObject({
      message: 'passwordTooLong',
    });
    expect(problemToState({ field: 'name', reason: 'invalid' })).toMatchObject({
      message: 'nameInvalid',
      field: 'name',
    });
  });
});

describe('maskEmail', () => {
  it('giữ ký tự đầu và tên miền', () => {
    expect(maskEmail('linh.nguyen@example.com')).toBe('l***@example.com');
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });
  it('chuỗi không phải email → ***', () => {
    expect(maskEmail('khong-phai-email')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail('abc@')).toBe('***');
  });
});
