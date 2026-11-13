import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import vi_messages from '../../../../../packages/shared/src/i18n/messages/vi.json';

vi.mock('../../app/app/(guarded)/composer/actions', () => ({
  savePublishPostAction: vi.fn(),
  cancelPublishScheduleAction: vi.fn(),
  deletePublishPostAction: vi.fn(),
}));

import { type ComposerChannel, type ComposerInitial, ComposerStudio } from './composer-studio';

const channels: ComposerChannel[] = [
  {
    id: 'c1',
    name: 'Fanpage An Nhiên',
    platform: 'facebook',
    status: 'connected',
    canPublish: true,
  },
  { id: 'c2', name: 'Page hết hạn', platform: 'facebook', status: 'expired', canPublish: true },
  {
    id: 'c3',
    name: 'Page thiếu quyền',
    platform: 'facebook',
    status: 'connected',
    canPublish: false,
  },
];

const render = (
  over: { channels?: ComposerChannel[]; publishEnabled?: boolean; initial?: ComposerInitial } = {},
) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={vi_messages}>
      <ComposerStudio
        channels={over.channels ?? channels}
        timeZone="Asia/Ho_Chi_Minh"
        publishEnabled={over.publishEnabled ?? true}
        {...(over.initial ? { initial: over.initial } : {})}
      />
    </NextIntlClientProvider>,
  );

const button = (html: string, value: string) =>
  html.match(new RegExp(`<button[^>]*value="${value}"[^>]*>`))?.[0] ?? '';

describe('ComposerStudio', () => {
  it('hiện kênh THẬT; kênh hết hạn bị khóa; mặc định KHÔNG chọn kênh nào (tránh đăng nhầm)', () => {
    const html = render();
    expect(html).toContain('Fanpage An Nhiên');
    expect(html).toContain('Page hết hạn');
    expect(html).toContain('Đã chọn 0 kênh');
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*name="channel"[^>]*checked=""/);
    expect(html).toMatch(
      /<input[^>]*name="channel"[^>]*value="c2"[^>]*disabled=""|<input[^>]*disabled=""[^>]*name="channel"[^>]*value="c2"/,
    );
  });

  it('kênh thiếu quyền pages_manage_posts có cảnh báo riêng', () => {
    const html = render();
    expect(html).toContain('Thiếu quyền đăng bài (pages_manage_posts)');
  });

  it('chưa có kênh → báo trống kèm liên kết kết nối kênh', () => {
    const html = render({ channels: [] });
    expect(html).toContain('Chưa có kênh nào được kết nối.');
    expect(html).toContain('href="/app/channels"');
  });

  it('bộ đếm ký tự theo nền tảng đúng giới hạn thiết kế (63.206 / 2.200 / 2.200) bắt đầu từ 0', () => {
    const html = render();
    expect(html).toContain('0 / 63.206');
    expect(html.match(/0 \/ 2\.200/g)).toHaveLength(2);
  });

  it('có biểu mẫu thật: trường message, channel, date, time và ba nút gửi với ý định draft / schedule / publish', () => {
    const html = render();
    expect(html).toMatch(/<form[^>]*>/);
    expect(html).toContain('name="message"');
    expect(html).toContain('name="date"');
    expect(html).toContain('name="time"');
    for (const intent of ['draft', 'schedule', 'publish']) {
      expect(button(html, intent), intent).toContain('type="submit"');
    }
  });

  it('LƯU NHÁP luôn bấm được; Lên lịch/Đăng ngay bị khóa khi cờ TẮT hoặc chưa có nội dung và kênh', () => {
    const off = render({ publishEnabled: false });
    expect(button(off, 'draft')).not.toContain('disabled');
    expect(button(off, 'schedule')).toContain('disabled');
    expect(button(off, 'publish')).toContain('disabled');
    expect(off).toContain('chưa được bật trên máy chủ');
    const on = render({ publishEnabled: true });
    expect(button(on, 'schedule')).toContain('disabled'); // chưa có nội dung + kênh
    expect(on).toContain('AI không tự viết hay tự đăng bài');
  });

  it('sửa bài có sẵn: điền nội dung, kênh đã chọn, ngày giờ; có nút Xóa; bài đã lên lịch có nút Hủy lịch', () => {
    const html = render({
      initial: {
        id: 'p1',
        message: 'Nội dung cũ',
        channelIds: ['c1'],
        status: 'scheduled',
        date: '2026-12-02',
        time: '10:30',
      },
    });
    expect(html).toContain('Nội dung cũ');
    expect(html).toContain('Sửa bài viết');
    expect(html).toContain('value="2026-12-02"');
    expect(html).toContain('value="10:30"');
    expect(html).toContain('Đã chọn 1 kênh');
    expect(html).toContain('>Xóa<');
    expect(html).toContain('Hủy lịch');
    expect(html).toContain('name="id" value="p1"');
  });

  it('phần chưa có backend (AI caption, hashtag, media, gắn sản phẩm) vẫn vô hiệu', () => {
    const html = render();
    for (const label of ['AI gợi ý caption', 'Tự động hashtag', 'Thêm media', 'Gắn sản phẩm']) {
      expect(html, label).toMatch(
        new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>).)*${label}`, 's'),
      );
    }
  });

  it('KHÔNG có dữ liệu mẫu bịa từ bản thiết kế (khung giờ vàng, sản phẩm mẫu, tên cửa hàng mẫu, hashtag gợi ý)', () => {
    const html = render();
    for (const fake of [
      'Khung giờ vàng',
      'Áo Thun Cotton',
      'Thời Trang Mẫu',
      '#thoitrangnu',
      '199.000',
      'Top tương tác',
    ]) {
      expect(html, fake).not.toContain(fake);
    }
  });

  it('có liên kết thật tới Kho tri thức, cài đặt tự gửi và Lịch đăng', () => {
    const html = render();
    expect(html).toContain('href="/app/kb"');
    expect(html).toContain('href="/app/automation"');
    expect(html).toContain('href="/app/calendar"');
  });
});
