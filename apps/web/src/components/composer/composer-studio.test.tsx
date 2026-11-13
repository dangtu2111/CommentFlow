import type { CaptionNotReady } from '@flow/ai';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import vi_messages from '../../../../../packages/shared/src/i18n/messages/vi.json';

vi.mock('../../app/app/(guarded)/composer/actions', () => ({
  savePublishPostAction: vi.fn(),
  cancelPublishScheduleAction: vi.fn(),
  deletePublishPostAction: vi.fn(),
  suggestCaptionAction: vi.fn(),
}));

import {
  type ComposerChannel,
  type ComposerInitial,
  type ComposerProduct,
  ComposerStudio,
} from './composer-studio';
import type { ComposerMedia } from './media-uploader';

const channels: ComposerChannel[] = [
  {
    id: 'c1',
    name: 'Fanpage An Nhiên',
    platform: 'facebook',
    avatarUrl: 'https://scontent.fbcdn.net/page.jpg',
    status: 'connected',
    canPublish: true,
  },
  {
    id: 'c2',
    name: 'Page hết hạn',
    platform: 'facebook',
    avatarUrl: null,
    status: 'expired',
    canPublish: true,
  },
  {
    id: 'c3',
    name: 'Page thiếu quyền',
    platform: 'facebook',
    avatarUrl: 'http://insecure.example/x.jpg',
    status: 'connected',
    canPublish: false,
  },
];

const render = (
  over: {
    channels?: ComposerChannel[];
    products?: ComposerProduct[];
    mediaEnabled?: boolean;
    initialMedia?: ComposerMedia[];
    publishEnabled?: boolean;
    aiReason?: CaptionNotReady | null;
    initial?: ComposerInitial;
  } = {},
) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={vi_messages}>
      <ComposerStudio
        channels={over.channels ?? channels}
        products={over.products ?? []}
        mediaEnabled={over.mediaEnabled ?? false}
        initialMedia={over.initialMedia ?? []}
        timeZone="Asia/Ho_Chi_Minh"
        publishEnabled={over.publishEnabled ?? true}
        aiReason={over.aiReason === undefined ? 'flag_off' : over.aiReason}
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
        productIds: ['pr1'],
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

  it('phần chưa có backend (AI caption, hashtag, gắn sản phẩm khi chưa có sản phẩm) vẫn vô hiệu', () => {
    const html = render();
    for (const label of ['AI gợi ý caption', 'Tự động hashtag', 'Gắn sản phẩm']) {
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

  it('gắn sản phẩm: chưa có sản phẩm → nút khóa kèm lý do; có sản phẩm → bật; bài sửa điền lại sản phẩm đã chọn', () => {
    const none = render();
    expect(none).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Gắn sản phẩm/s);
    expect(none).toContain('Cửa hàng chưa có sản phẩm');
    const products = [
      {
        id: 'pr1',
        name: 'Áo thun basic',
        sku: 'AT1',
        priceVnd: 199000,
        imageUrl: 'https://cdn.shopify.com/a.jpg',
      },
    ];
    const some = render({ products });
    expect(some).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Gắn sản phẩm/s);
    const editing = render({
      products,
      initial: {
        id: 'p1',
        message: 'x',
        channelIds: [],
        productIds: ['pr1'],
        status: 'draft',
        date: '',
        time: '',
      },
    });
    expect(editing).toMatch(/<input[^>]*name="product"[^>]*value="pr1"/);
    expect(editing).toContain('Áo thun basic');
    expect(editing).toContain('src="https://cdn.shopify.com/a.jpg"');
    const unsafe = render({
      products: [
        {
          id: 'pr1',
          name: 'Áo thun basic',
          sku: null,
          priceVnd: null,
          imageUrl: 'http://x.vn/a.jpg',
        },
      ],
      initial: {
        id: 'p1',
        message: 'x',
        channelIds: [],
        productIds: ['pr1'],
        status: 'draft',
        date: '',
        time: '',
      },
    });
    expect(unsafe).toContain('Áo thun basic');
    expect(unsafe).not.toContain('http://x.vn/a.jpg');
  });

  it('ảnh/video: chưa cấu hình kho → khóa kèm lý do; bật → có quy tắc; bài sửa điền lại file đã tải (ảnh và video)', () => {
    const off = render();
    expect(off).toContain('Chưa bật tải ảnh/video');
    expect(off).toMatch(
      /<input[^>]*type="file"[^>]*disabled=""|<input[^>]*disabled=""[^>]*type="file"/,
    );
    const on = render({ mediaEnabled: true });
    expect(on).not.toContain('Chưa bật tải ảnh/video');
    expect(on).toContain('Tối đa 10 ảnh');
    const withFiles = render({
      mediaEnabled: true,
      initialMedia: [
        { id: 'm1', kind: 'image', contentType: 'image/png', sizeBytes: 10 },
        { id: 'm2', kind: 'video', contentType: 'video/mp4', sizeBytes: 20 },
      ],
    });
    expect(withFiles).toMatch(/<input[^>]*name="media"[^>]*value="m1"/);
    expect(withFiles).toContain('src="/app/api/media/m1"');
    expect(withFiles).toMatch(/<video[^>]*src="\/app\/api\/media\/m2"/);
  });

  it('AI caption/hashtag: cờ tắt → nút khóa kèm lý do; sẵn sàng → bật khi đã có nội dung', () => {
    const off = render({ aiReason: 'flag_off' });
    expect(off).toContain('AI soạn caption đang tắt cho cửa hàng này.');
    expect(off).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*AI gợi ý caption/s);
    const missing = render({ aiReason: 'missing_model' });
    expect(missing).toContain('CAPTION_LLM_MODEL');
    const ready = render({ aiReason: null });
    expect(ready).not.toContain('AI soạn caption đang tắt');
    expect(ready).not.toContain('CAPTION_LLM_MODEL');
  });

  it('ảnh đại diện kênh: hiện ảnh https trong danh sách kênh; http/không có → chữ cái đầu', () => {
    const html = render();
    expect(html).toContain('src="https://scontent.fbcdn.net/page.jpg"');
    expect(html).not.toContain('insecure.example');
  });
});
