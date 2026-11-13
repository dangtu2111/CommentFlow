import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import vi_messages from '../../../../../packages/shared/src/i18n/messages/vi.json';

vi.mock('../../app/app/(guarded)/composer/actions', () => ({
  cancelPublishScheduleAction: vi.fn(),
  deletePublishPostAction: vi.fn(),
}));
vi.mock('../../app/app/(guarded)/calendar/actions', () => ({
  updatePublishPostAction: vi.fn(),
}));

import { type ModalPost, PublishModal } from './publish-modal';

const target = (over: Partial<ModalPost['targets'][number]> = {}) => ({
  id: 't1',
  channelName: 'Lụa Tơ Tằm',
  avatarUrl: 'https://scontent.fbcdn.net/p.jpg',
  status: 'pending' as const,
  errorCode: null,
  ...over,
});
const post = (over: Partial<ModalPost> = {}): ModalPost => ({
  id: 'p1',
  status: 'scheduled',
  message: 'Khai trương cửa hàng #lua',
  date: '2026-11-20',
  time: '09:30',
  targets: [target()],
  ...over,
});
const render = (
  over: { post?: ModalPost; publishEnabled?: boolean; prefillDate?: string; media?: never[] } = {},
) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={vi_messages}>
      <PublishModal
        post={over.post ?? post()}
        media={[]}
        closeHref="/app/calendar?w=2026-11-16"
        timeZone="Asia/Ho_Chi_Minh"
        publishEnabled={over.publishEnabled ?? true}
        prefillDate={over.prefillDate}
      />
    </NextIntlClientProvider>,
  );
const btn = (html: string, value: string) =>
  html.match(new RegExp(`<button[^>]*value="${value}"[^>]*>`))?.[0] ?? '';

describe('PublishModal', () => {
  it('là hộp thoại: có nội dung, ngày/giờ điền sẵn theo múi giờ cửa hàng, xem trước kiểu Facebook (tên kênh + ảnh đại diện) và liên kết đóng', () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/<textarea[^>]*name="message"[^>]*>Khai trương cửa hàng #lua<\/textarea>/);
    expect(html).toMatch(/<input[^>]*name="date"[^>]*value="2026-11-20"/);
    expect(html).toMatch(/<input[^>]*name="time"[^>]*value="09:30"/);
    expect(html).toContain('Asia/Ho_Chi_Minh');
    expect(html).toContain('Lụa Tơ Tằm');
    expect(html).toContain('src="https://scontent.fbcdn.net/p.jpg"');
    expect(html).toContain('href="/app/calendar?w=2026-11-16"');
    expect(html).toContain('<span class="text-primary">#lua</span>');
  });

  it('bài đã lên lịch: Lưu thay đổi + Hủy lịch + Sửa đầy đủ; KHÔNG có Lên lịch/Xóa', () => {
    const html = render();
    expect(btn(html, 'save')).not.toBe('');
    expect(btn(html, 'save')).not.toContain('disabled');
    expect(html).toContain('Hủy lịch');
    expect(html).toContain('href="/app/composer?id=p1"');
    expect(btn(html, 'schedule')).toBe('');
    expect(html).not.toContain('>Xóa<');
  });

  it('bản nháp: Lưu nháp + Lên lịch (+ Xóa); ngày kéo vào được điền sẵn và có giờ mặc định 09:00', () => {
    const html = render({
      post: post({ status: 'draft', date: '', time: '' }),
      prefillDate: '2026-11-18',
    });
    expect(btn(html, 'draft')).not.toBe('');
    expect(btn(html, 'schedule')).not.toContain('disabled');
    expect(html).toMatch(/<input[^>]*name="date"[^>]*value="2026-11-18"/);
    expect(html).toMatch(/<input[^>]*name="time"[^>]*value="09:00"/);
    expect(html).toContain('Xóa');
  });

  it('cờ đăng bài TẮT: Lên lịch/Lưu thay đổi bị khóa kèm giải thích; lưu nháp vẫn được', () => {
    const draft = render({
      post: post({ status: 'draft', date: '', time: '' }),
      publishEnabled: false,
    });
    expect(btn(draft, 'schedule')).toContain('disabled');
    expect(btn(draft, 'draft')).not.toContain('disabled');
    expect(draft).toContain('Đăng bài chưa được bật trên máy chủ');
    expect(btn(render({ publishEnabled: false }), 'save')).toContain('disabled');
  });

  it('thiếu nội dung hoặc chưa chọn kênh → Lên lịch bị khóa, báo chưa chọn kênh', () => {
    const noText = render({ post: post({ status: 'draft', message: '', date: '2026-11-20' }) });
    expect(btn(noText, 'schedule')).toContain('disabled');
    const noChannel = render({ post: post({ status: 'draft', targets: [] }) });
    expect(btn(noChannel, 'schedule')).toContain('disabled');
    expect(noChannel).toContain('Bài chưa chọn kênh');
  });

  it('bài đã đăng: chỉ xem (ô nội dung chỉ đọc, không ô ngày giờ, không nút lưu); lỗi: có Xóa và lý do dễ hiểu, mã lạ không in ra', () => {
    const published = render({
      post: post({ status: 'published', targets: [target({ status: 'published' })] }),
    });
    expect(published).toMatch(/<textarea[^>]*readOnly=""/);
    expect(published).not.toMatch(/name="date"/);
    expect(btn(published, 'save')).toBe('');
    const failed = render({
      post: post({
        status: 'failed',
        targets: [target({ status: 'failed', errorCode: 'missing_permission' })],
      }),
    });
    expect(failed).toContain('Kênh chưa có quyền đăng bài');
    expect(failed).toContain('Xóa');
    const weird = render({
      post: post({
        status: 'failed',
        targets: [target({ status: 'failed', errorCode: 'DROP TABLE' })],
      }),
    });
    expect(weird).not.toContain('DROP TABLE');
  });
});
