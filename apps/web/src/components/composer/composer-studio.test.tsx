import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import vi_messages from '../../../../../packages/shared/src/i18n/messages/vi.json';
import { type ComposerChannel, ComposerStudio } from './composer-studio';

const channels: ComposerChannel[] = [
  { id: 'c1', name: 'Fanpage An Nhiên', platform: 'facebook', status: 'connected' },
  { id: 'c2', name: 'Page hết hạn', platform: 'facebook', status: 'expired' },
];

const render = (list: ComposerChannel[] = channels) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={vi_messages}>
      <ComposerStudio channels={list} timeZone="Asia/Ho_Chi_Minh" />
    </NextIntlClientProvider>,
  );

describe('ComposerStudio', () => {
  it('hiện kênh THẬT: kênh đã kết nối chọn được và mặc định được chọn; kênh hết hạn bị khóa', async () => {
    const html = render();
    expect(html).toContain('Fanpage An Nhiên');
    expect(html).toContain('Page hết hạn');
    expect(html).toMatch(/<input[^>]*checked=""[^>]*>/);
    expect(html).toContain('Đã chọn 1 kênh');
    expect(html).toMatch(
      /<input[^>]*disabled=""[^>]*id="[^"]*-ch-c2"|<input[^>]*id="[^"]*-ch-c2"[^>]*disabled=""/,
    );
  });

  it('chưa có kênh → báo trống kèm liên kết kết nối kênh', () => {
    const html = render([]);
    expect(html).toContain('Chưa có kênh nào được kết nối.');
    expect(html).toContain('href="/app/channels"');
  });

  it('bộ đếm ký tự theo nền tảng đúng giới hạn thiết kế (63.206 / 2.200 / 2.200) bắt đầu từ 0', () => {
    const html = render();
    expect(html).toContain('0 / 63.206');
    expect(html.match(/0 \/ 2\.200/g)).toHaveLength(2);
  });

  it('mọi nút chưa có backend đều vô hiệu: lưu nháp, lên lịch, đăng ngay, AI caption, hashtag, thêm media, gắn sản phẩm', () => {
    const html = render();
    for (const label of [
      'Lưu bản nháp',
      'Lên lịch đăng',
      'Đăng ngay',
      'AI gợi ý caption',
      'Tự động hashtag',
      'Thêm media',
      'Gắn sản phẩm',
    ]) {
      expect(html, label).toMatch(
        new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>).)*${label}`, 's'),
      );
    }
    expect(html).toContain('chưa được lưu hay gửi đi đâu');
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
