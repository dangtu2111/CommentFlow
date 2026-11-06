import { describe, expect, it } from 'vitest';
import { maskPhone, normalizePhoneE164 } from './phone';

describe('normalizePhoneE164', () => {
  it.each([
    ['0912345678', '+84912345678'],
    ['0912 345 678', '+84912345678'],
    ['091-234-5678', '+84912345678'],
    ['84912345678', '+84912345678'],
    ['+84 912 345 678', '+84912345678'],
    ['+84(0)912345678', '+84912345678'],
    ['0332345678', '+84332345678'],
    ['+14155552671', '+14155552671'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhoneE164(input)).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '12345',
    '0212345678', // đầu 02 = máy bàn, không nhận SMS
    '091234567', // thiếu số
    '09123456789', // thừa số
    '+0123456789',
    '+8491234567890123',
    '0912345678; DROP TABLE users',
  ])('từ chối %j', (input) => {
    expect(normalizePhoneE164(input)).toBeNull();
  });

  it('không nhận SĐT quốc tế khi thiếu dấu +', () => {
    expect(normalizePhoneE164('14155552671')).toBeNull();
  });
});

describe('maskPhone', () => {
  it('che phần giữa, giữ đầu và 3 số cuối', () => {
    expect(maskPhone('+84912345678')).toBe('+849 ••• ••• 678');
  });
  it('không bao giờ chứa số giữa', () => {
    expect(maskPhone('+84912345678')).not.toContain('1234');
  });
  it('giá trị rỗng/không hợp lệ → rỗng', () => {
    expect(maskPhone(null)).toBe('');
    expect(maskPhone('x')).toBe('');
  });
});
