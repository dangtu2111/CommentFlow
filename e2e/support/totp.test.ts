import { describe, expect, it } from 'vitest';
import { base32Decode, secretFromUri, totp, wrongCode } from './totp';

// Khóa thử của RFC 6238 Phụ lục B (SHA-1): ASCII "12345678901234567890" mã hóa base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp (vector RFC 6238, SHA-1, 8 chữ số)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('tại giây %i cho mã %s', (seconds, expected) => {
    expect(totp(RFC_SECRET, seconds * 1000, 30, 8)).toBe(expected);
  });

  it('mặc định 6 chữ số = 6 chữ số cuối của mã 8 chữ số', () => {
    expect(totp(RFC_SECRET, 59_000)).toBe('287082');
  });
});

describe('base32Decode / secretFromUri / wrongCode', () => {
  it('giải mã base32 ra đúng byte', () => {
    expect(base32Decode(RFC_SECRET).toString('ascii')).toBe('12345678901234567890');
  });

  it('báo lỗi với ký tự ngoài bảng chữ cái', () => {
    expect(() => base32Decode('abc1')).toThrow();
  });

  it('lấy secret từ URI otpauth', () => {
    expect(secretFromUri(`otpauth://totp/CF:a%40b.c?secret=${RFC_SECRET}&issuer=CF`)).toBe(
      RFC_SECRET,
    );
    expect(() => secretFromUri('otpauth://totp/x')).toThrow();
  });

  it('mã sai không trùng cửa sổ hiện tại và hai cửa sổ kề bên', () => {
    const bad = wrongCode(RFC_SECRET);
    for (const step of [-1, 0, 1]) {
      expect(bad).not.toBe(totp(RFC_SECRET, Date.now() + step * 30_000));
    }
  });
});
