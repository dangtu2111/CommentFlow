import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getMessages } from '../../i18n/messages';
import { AuthNotice, AuthPasswordField, AuthTextField, SoonField } from './auth-fields';

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={getMessages('vi')}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('ô nhập xác thực (Tailwind)', () => {
  it('lỗi gắn vào ô bằng aria-invalid + aria-describedby và đọc ngay (role=alert)', () => {
    const html = render(
      <AuthTextField name="email" icon="mail" label="Email" error="Sai định dạng" />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="[^"]+-note"/);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Sai định dạng');
  });

  it('không lỗi thì không có aria-invalid; gợi ý không phải alert', () => {
    const html = render(<AuthTextField name="email" icon="mail" label="Email" hint="Gợi ý" />);
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('Gợi ý');
  });

  it('ô mật khẩu mặc định ẩn, có nút hiện/ẩn có nhãn', () => {
    const html = render(<AuthPasswordField name="password" label="Mật khẩu" />);
    expect(html).toContain('type="password"');
    expect(html).toContain('aria-label="Hiện mật khẩu"');
    expect(html).toContain('autoCapitalize="none"');
  });

  it('ô chưa có chức năng vô hiệu kèm chú thích "Sắp có"', () => {
    const html = render(<SoonField label="Tên Shop" soon="Sắp có" />);
    expect(html).toContain('disabled');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Sắp có');
  });

  it('thông báo lỗi dùng role=alert, còn lại là status', () => {
    expect(render(<AuthNotice tone="danger">x</AuthNotice>)).toContain('role="alert"');
    expect(render(<AuthNotice tone="success">x</AuthNotice>)).toContain('role="status"');
  });
});
