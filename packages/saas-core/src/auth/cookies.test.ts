import { describe, expect, it } from 'vitest';
import { cookiesFromResponse, parseSetCookie } from './cookies';

describe('parseSetCookie', () => {
  it('đọc đủ thuộc tính của cookie phiên', () => {
    const cookie = parseSetCookie(
      'better-auth.session_token=abc.def%3D; Max-Age=1209600; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
    expect(cookie).toEqual({
      name: 'better-auth.session_token',
      value: 'abc.def%3D',
      maxAge: 1209600,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
  });

  it('giữ dấu "=" trong giá trị; đọc Expires, Domain; bỏ qua thuộc tính lạ', () => {
    const cookie = parseSetCookie(
      'a=b=c==; Domain=example.test; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Priority=High',
    );
    expect(cookie?.value).toBe('b=c==');
    expect(cookie?.domain).toBe('example.test');
    expect(cookie?.expires?.getTime()).toBe(0);
  });

  it('cookie xóa (Max-Age=0, giá trị rỗng) vẫn đọc được', () => {
    expect(parseSetCookie('token=; Max-Age=0; Path=/')).toMatchObject({
      name: 'token',
      value: '',
      maxAge: 0,
    });
  });

  it('chuỗi không hợp lệ → null', () => {
    expect(parseSetCookie('')).toBeNull();
    expect(parseSetCookie('khong-co-dau-bang')).toBeNull();
    expect(parseSetCookie('=giatri')).toBeNull();
  });
});

describe('cookiesFromResponse', () => {
  it('tách từng cookie khi phản hồi có nhiều Set-Cookie', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'a=1; Path=/; HttpOnly');
    headers.append('set-cookie', 'b=2; Path=/; SameSite=Strict');
    const cookies = cookiesFromResponse(new Response(null, { headers }));
    expect(cookies.map((c) => [c.name, c.value])).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });
});
