import type { CalendarPost } from '@flow/db/runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

import { PostDrawer } from './post-drawer';

const post = (over: Partial<CalendarPost> = {}): CalendarPost => ({
  id: 'p1',
  channelId: 'c1',
  channelName: 'Page A',
  platform: 'facebook',
  externalId: 'x1',
  message: 'Nội dung bài\ndòng hai',
  permalink: 'https://www.facebook.com/page/posts/1',
  mediaUrl: 'https://scontent.xx.fbcdn.net/v/a.jpg?oh=1',
  isAd: false,
  createdTime: new Date('2026-11-10T03:00:00Z'),
  day: '2026-11-10',
  time: '10:00',
  commentCount: 7,
  pendingCount: 2,
  ...over,
});

const render = async (p: CalendarPost) =>
  renderToStaticMarkup(
    await PostDrawer({
      post: p,
      closeHref: '/app/calendar?w=2026-11-09',
      locale: 'vi',
      timeZone: 'Asia/Ho_Chi_Minh',
    }),
  );

describe('PostDrawer', () => {
  it('hiện kênh, giờ theo múi giờ workspace, nội dung, số liệu thật; có liên kết đóng và liên kết bài gốc an toàn', async () => {
    const html = await render(post());
    expect(html).toContain('Page A');
    expect(html).toContain('Nội dung bài');
    expect(html).toContain('>7<');
    expect(html).toContain('>2<');
    expect(html).toContain('href="/app/calendar?w=2026-11-09"');
    expect(html).toContain('href="https://www.facebook.com/page/posts/1"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('src="https://scontent.xx.fbcdn.net/v/a.jpg?oh=1"');
    expect(html).toMatch(/10:00/);
  });

  it('URL không an toàn bị bỏ: permalink javascript: không thành liên kết, ảnh http không thành <img>', async () => {
    const html = await render(
      post({ permalink: 'javascript:alert(1)', mediaUrl: 'http://x.test/a.jpg' }),
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('drawer.openOriginal');
    expect(html).not.toContain('<img');
  });

  it('chưa có nội dung → chữ trung thực; "Hủy lịch"/"Chỉnh sửa bài" vô hiệu (chưa có chức năng)', async () => {
    const html = await render(post({ message: null }));
    expect(html).toContain('drawer.noContent');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*drawer\.cancel/s);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*drawer\.edit/s);
  });
});
