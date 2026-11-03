import { describe, expect, it, vi } from 'vitest';
import { applyCookies } from './apply-cookies';

describe('applyCookies', () => {
  it('giải mã giá trị đã mã hóa URL để Next mã hóa đúng một lần; giữ nguyên thuộc tính bảo mật', () => {
    const set = vi.fn();
    applyCookies({ set }, [
      {
        name: 'better-auth.session_token',
        value: 'abc.def%2Bxyz%3D',
        path: '/',
        maxAge: 1209600,
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      },
    ]);
    expect(set).toHaveBeenCalledWith({
      name: 'better-auth.session_token',
      value: 'abc.def+xyz=',
      path: '/',
      maxAge: 1209600,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
  });

  it('cookie xóa (maxAge 0, giá trị rỗng) được truyền đúng; thiếu path → "/"', () => {
    const set = vi.fn();
    applyCookies({ set }, [{ name: 'x', value: '', maxAge: 0 }]);
    expect(set).toHaveBeenCalledWith({ name: 'x', value: '', path: '/', maxAge: 0 });
  });

  it('giá trị có chuỗi % hỏng không làm văng lỗi', () => {
    const set = vi.fn();
    expect(() => applyCookies({ set }, [{ name: 'x', value: '%E0%A4%A' }])).not.toThrow();
    expect(set.mock.calls[0]?.[0].value).toBe('%E0%A4%A');
  });
});
