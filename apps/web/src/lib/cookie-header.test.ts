import { describe, expect, it } from 'vitest';
import { cookieHeaderFromJar } from './cookie-header';

describe('cookieHeaderFromJar', () => {
  it('giữ nguyên chuỗi gốc khi cookie không đổi (không mã hóa lại)', () => {
    const raw = 'a=1; better-auth.session_token=abc.def%2Bxyz%3D';
    const jar = [
      { name: 'a', value: '1' },
      { name: 'better-auth.session_token', value: 'abc.def+xyz=' },
    ];
    expect(cookieHeaderFromJar(raw, jar)).toBe(raw);
  });

  it('dùng giá trị MỚI khi Server Action vừa xoay phiên (hồi quy: trang dựng lại sau action thấy phiên cũ → về /login, mất mã dự phòng 2FA)', () => {
    const raw = 'cf-workspace=w1; better-auth.session_token=OLD';
    const jar = [
      { name: 'cf-workspace', value: 'w1' },
      { name: 'better-auth.session_token', value: 'NEW+1=' },
    ];
    expect(cookieHeaderFromJar(raw, jar)).toBe(
      'cf-workspace=w1; better-auth.session_token=NEW%2B1%3D',
    );
  });

  it('bỏ cookie đã bị xóa và thêm cookie mới đặt', () => {
    const raw = 'gone=1; keep=2';
    const jar = [
      { name: 'keep', value: '2' },
      { name: 'fresh', value: 'x y' },
    ];
    expect(cookieHeaderFromJar(raw, jar)).toBe('keep=2; fresh=x%20y');
  });

  it('không có header gốc → dựng từ jar', () => {
    expect(cookieHeaderFromJar(null, [{ name: 'a', value: 'b' }])).toBe('a=b');
    expect(cookieHeaderFromJar(null, [])).toBe('');
  });
});
