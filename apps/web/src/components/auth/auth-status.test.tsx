import { CircleAlert, MailCheck } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthStatus } from './auth-status';

describe('AuthStatus', () => {
  it('hiện biểu tượng ẩn với trình đọc màn hình, tiêu đề h1 và mô tả', () => {
    const html = renderToStaticMarkup(
      <AuthStatus icon={MailCheck} title="Kiểm tra email" description="Đã gửi thư" />,
    );
    expect(html).toContain('<h1');
    expect(html).toContain('Kiểm tra email');
    expect(html).toContain('Đã gửi thư');
    expect(html).toContain('aria-hidden="true"');
  });

  it('tông màu đi theo class của biến thể; mặc định là trung tính', () => {
    const base = renderToStaticMarkup(<AuthStatus icon={MailCheck} title="A" />);
    const danger = renderToStaticMarkup(<AuthStatus icon={CircleAlert} tone="danger" title="B" />);
    expect(base).not.toContain('bg-error-container');
    expect(danger).toContain('bg-error-container');
  });

  it('không có mô tả thì không sinh đoạn trống; nội dung con nằm sau tiêu đề', () => {
    const html = renderToStaticMarkup(
      <AuthStatus icon={MailCheck} title="A">
        <button type="button">Tiếp</button>
      </AuthStatus>,
    );
    expect(html).not.toMatch(/<p[\s>]/);
    expect(html.indexOf('Tiếp')).toBeGreaterThan(html.indexOf('A'));
  });
});
