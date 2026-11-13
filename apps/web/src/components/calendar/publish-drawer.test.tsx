import type { PublishPostItem } from '@flow/db/runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('../../app/app/(guarded)/composer/actions', () => ({
  cancelPublishScheduleAction: vi.fn(),
  deletePublishPostAction: vi.fn(),
}));

import { PublishDrawer } from './publish-drawer';

const item = (over: Partial<PublishPostItem> = {}): PublishPostItem => ({
  id: 'pp1',
  message: 'Nội dung bài\ndòng hai',
  status: 'scheduled',
  scheduledAt: new Date('2026-12-02T03:30:00Z'),
  publishedAt: null,
  day: '2026-12-02',
  time: '10:30',
  targets: [
    {
      id: 't1',
      channelId: 'c1',
      channelName: 'Fanpage A',
      status: 'pending',
      errorCode: null,
      externalPostId: null,
    },
  ],
  ...over,
});

const render = async (post: PublishPostItem) =>
  renderToStaticMarkup(
    await PublishDrawer({
      post,
      closeHref: '/app/calendar?w=2026-11-30',
      locale: 'vi',
      timeZone: 'Asia/Ho_Chi_Minh',
    }),
  );

const hasButton = (html: string, label: string) =>
  new RegExp(`<button[^>]*type="submit"[^>]*>(?:(?!</button>).)*${label}`, 's').test(html);

describe('PublishDrawer — thao tác theo trạng thái', () => {
  it('đã lên lịch: có Sửa (liên kết tới Biên tập), Hủy lịch; KHÔNG có Xóa', async () => {
    const html = await render(item({ status: 'scheduled' }));
    expect(html).toContain('href="/app/composer?id=pp1"');
    expect(hasButton(html, 'own.cancel')).toBe(true);
    expect(hasButton(html, 'own.delete')).toBe(false);
    expect(html).toContain('name="postId" value="pp1"');
    expect(html).toContain('status.scheduled');
  });

  it('nháp: Sửa và Xóa; KHÔNG có Hủy lịch', async () => {
    const html = await render(item({ status: 'draft', scheduledAt: null }));
    expect(html).toContain('href="/app/composer?id=pp1"');
    expect(hasButton(html, 'own.delete')).toBe(true);
    expect(hasButton(html, 'own.cancel')).toBe(false);
  });

  it('lỗi / đăng một phần: chỉ Xóa (không Sửa, không Hủy lịch)', async () => {
    for (const status of ['failed', 'partial'] as const) {
      const html = await render(item({ status }));
      expect(html, status).not.toContain('/app/composer?id=');
      expect(hasButton(html, 'own.delete'), status).toBe(true);
      expect(hasButton(html, 'own.cancel'), status).toBe(false);
    }
  });

  it('đang đăng / đã đăng: chỉ xem — không nút nào, có ghi chú đang khóa', async () => {
    for (const status of ['publishing', 'published'] as const) {
      const html = await render(item({ status }));
      expect(html, status).not.toContain('<button');
      expect(html, status).not.toContain('/app/composer?id=');
      expect(html, status).toContain('own.lockedHint');
    }
  });
});

describe('PublishDrawer — kết quả từng kênh và lý do lỗi', () => {
  it('hiện trạng thái từng kênh; mã lỗi đã biết → khóa chữ dễ hiểu; mã lạ → chữ chung, KHÔNG in mã lạ', async () => {
    const html = await render(
      item({
        status: 'partial',
        targets: [
          {
            id: 't1',
            channelId: 'c1',
            channelName: 'Fanpage A',
            status: 'published',
            errorCode: null,
            externalPostId: '1_2',
          },
          {
            id: 't2',
            channelId: 'c2',
            channelName: 'Fanpage B',
            status: 'failed',
            errorCode: 'missing_permission',
            externalPostId: null,
          },
          {
            id: 't3',
            channelId: 'c3',
            channelName: 'Fanpage C',
            status: 'unknown',
            errorCode: '<script>x</script>',
            externalPostId: null,
          },
        ],
      }),
    );
    expect(html).toContain('Fanpage A');
    expect(html).toContain('targetStatus.published');
    expect(html).toContain('publishError.missing_permission');
    expect(html).toContain('publishError.unknown_result');
    // Mã lỗi lạ không được in ra dưới bất kỳ dạng nào (kể cả đã thoát HTML).
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('&lt;script&gt;');
    expect(html).not.toContain('1_2');
  });

  it('nháp trống hiện chữ "chưa có nội dung"; có liên kết đóng giữ tuần', async () => {
    const html = await render(item({ status: 'draft', message: '', scheduledAt: null }));
    expect(html).toContain('drafts.untitled');
    expect(html).toContain('href="/app/calendar?w=2026-11-30"');
  });
});
