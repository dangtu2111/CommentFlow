import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import vi_messages from '../../../../../packages/shared/src/i18n/messages/vi.json';

vi.mock('../../app/app/(guarded)/channels/actions', () => ({
  connectPagesAction: vi.fn(),
  cancelConnectAction: vi.fn(),
}));

import { FbPageSelectModal } from './fb-page-select-modal';

const pages = [
  { id: '111', name: 'An Nhiên Store', connected: false, usable: true },
  { id: '333', name: 'An Nhiên Kids', connected: true, usable: true },
  { id: '444', name: 'Kho Gia Dụng', connected: false, usable: false },
];

const render = (over: Partial<Parameters<typeof FbPageSelectModal>[0]> = {}) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={vi_messages}>
      <FbPageSelectModal
        pages={pages}
        used={1}
        limit={3}
        permissions={{ sufficient: true, missing: [], tokenValid: true }}
        rerequestHref="/x?rerequest=1"
        switchAccountHref="/x"
        refreshHref="/y"
        {...over}
      />
    </NextIntlClientProvider>,
  );

describe('FbPageSelectModal', () => {
  it('hiện từng Page với ID và trạng thái đúng: chọn được / đã kết nối (khóa) / không có quyền quản lý (khóa)', () => {
    const html = render();
    expect(html).toContain('An Nhiên Store');
    expect(html).toContain('ID: 111');
    expect(html).toContain('Sẵn sàng kết nối');
    expect(html).toContain('Đã kết nối trong Workspace này');
    expect(html).toContain('Không khả dụng');
    // Chỉ Page chọn được có ô tick bật; Page đã kết nối và Page không có quyền bị khóa.
    expect(html).toMatch(/<input[^>]*id="fb-page-111"(?![^>]*disabled)[^>]*>/);
    expect(html).toMatch(/<input[^>]*id="fb-page-333"[^>]*disabled/);
    expect(html).toMatch(/<input[^>]*id="fb-page-444"[^>]*disabled/);
  });

  it('hạn mức và quyền: hiện số kênh đã dùng; đủ quyền thì không có nút cấp thêm; thiếu thì có nút trỏ tới rerequest', () => {
    const ok = render();
    expect(ok).toContain('1 / 3 kênh đã dùng');
    expect(ok).not.toContain('/x?rerequest=1');
    const missing = render({
      permissions: { sufficient: false, missing: ['pages_manage_engagement'], tokenValid: true },
    });
    expect(missing).toContain('Quản lý bình luận');
    expect(missing).toContain('href="/x?rerequest=1"');
  });

  it('chưa chọn Page nào → nút xác nhận bị khóa', () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*(<[^>]*>[^<]*)*Xác nhận/s);
  });

  it('không có Page nào → báo trống kèm hướng dẫn kiểm tra (không bịa dữ liệu)', () => {
    const html = render({ pages: [] });
    expect(html).toContain('Meta không trả về Page nào');
  });
});
