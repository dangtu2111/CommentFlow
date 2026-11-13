import type { CalendarPost, PublishPostItem } from '@flow/db/runtime';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import vi_messages from '../../../../../packages/shared/src/i18n/messages/vi.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../app/app/(guarded)/calendar/actions', () => ({
  movePublishPostAction: vi.fn(),
}));

import { WeekBoard } from './week-board';

const DAYS = [
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
  '2026-11-15',
];

const post = (over: Partial<CalendarPost>): CalendarPost => ({
  id: 'p1',
  channelId: 'c1',
  channelName: 'Page A',
  platform: 'facebook',
  externalId: 'x1',
  message: 'Áo thun mới về',
  permalink: null,
  mediaUrl: null,
  isAd: false,
  createdTime: new Date('2026-11-10T03:00:00Z'),
  day: '2026-11-10',
  time: '10:00',
  commentCount: 4,
  pendingCount: 1,
  ...over,
});

const render = async (byDay: Record<string, CalendarPost[]>, over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={vi_messages}>
      {
        await WeekBoard({
          days: DAYS,
          today: '2026-11-12',
          weekStart: '2026-11-09',
          platform: undefined,
          openPostId: undefined,
          byDay,
          publishByDay: Object.fromEntries(DAYS.map((d) => [d, []])),
          ...over,
        } as Parameters<typeof WeekBoard>[0])
      }
    </NextIntlClientProvider>,
  );

describe('WeekBoard', () => {
  it('7 cột theo thứ tự thứ Hai → Chủ nhật, nhãn ngày dd/MM, đánh dấu hôm nay', async () => {
    const html = await render(Object.fromEntries(DAYS.map((d) => [d, []])));
    for (let i = 0; i < 7; i += 1) expect(html).toContain(`weekday.${i}`);
    expect(html).toContain('09/11');
    expect(html).toContain('15/11');
    expect(html.match(/aria-current="date"/g)).toHaveLength(1);
    expect(html).toContain('>today<');
  });

  it('bài nằm đúng cột ngày, hiện giờ, nội dung, số bình luận và liên kết mở khung chi tiết giữ tuần/bộ lọc', async () => {
    const html = await render(
      { ...Object.fromEntries(DAYS.map((d) => [d, []])), '2026-11-10': [post({})] },
      { platform: 'facebook' },
    );
    expect(html).toContain('Áo thun mới về');
    expect(html).toContain('10:00');
    expect(html).toContain('href="/app/calendar?w=2026-11-09&amp;post=p1&amp;p=facebook"');
    expect(html).toContain('status.published');
  });

  it('bài chưa có nội dung → chữ trung thực "noContent"; bài quảng cáo có nhãn riêng; ngày trống ghi "emptyDay"', async () => {
    const html = await render({
      ...Object.fromEntries(DAYS.map((d) => [d, []])),
      '2026-11-10': [post({ message: null, isAd: true })],
    });
    expect(html).toContain('noContent');
    expect(html).toContain('>ad<');
    expect(html.match(/emptyDay/g)?.length).toBe(6);
  });

  it('bài đang mở được đánh dấu; mỗi cột có liên kết "Thêm bài" tới trang Biên tập', async () => {
    const html = await render(
      { ...Object.fromEntries(DAYS.map((d) => [d, []])), '2026-11-10': [post({})] },
      { openPostId: 'p1' },
    );
    expect(html).toContain('aria-current="true"');
    expect(html.match(/href="\/app\/composer"/g)).toHaveLength(7);
  });

  it('bài đăng từ CommentFlow nằm đúng ngày kèm nhãn trạng thái và tên kênh; liên kết mở khung chi tiết', async () => {
    const own: PublishPostItem = {
      id: 'pp1',
      message: 'Khai trương Chủ nhật',
      status: 'scheduled',
      scheduledAt: new Date('2026-11-15T03:00:00Z'),
      publishedAt: null,
      day: '2026-11-15',
      time: '10:00',
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
    };
    const html = await render(Object.fromEntries(DAYS.map((d) => [d, []])), {
      publishByDay: { ...Object.fromEntries(DAYS.map((d) => [d, []])), '2026-11-15': [own] },
    });
    expect(html).toContain('Khai trương Chủ nhật');
    expect(html).toContain('status.scheduled');
    expect(html).toContain('Fanpage A');
    expect(html).toContain('post=pp1');
    expect(html.match(/emptyDay/g)?.length).toBe(6);
  });

  it('kéo thả: bài đã lên lịch kéo được (kèm gợi ý), bài đã đăng/lỗi/nháp thì không; mỗi ngày là vùng thả', async () => {
    const mk = (id: string, status: PublishPostItem['status']): PublishPostItem => ({
      id,
      message: `bài ${id}`,
      status,
      scheduledAt: new Date('2026-11-15T03:00:00Z'),
      publishedAt: null,
      day: '2026-11-15',
      time: '10:00',
      targets: [],
    });
    const html = await render(Object.fromEntries(DAYS.map((d) => [d, []])), {
      publishByDay: {
        ...Object.fromEntries(DAYS.map((d) => [d, []])),
        '2026-11-15': [mk('s1', 'scheduled'), mk('p1', 'published'), mk('f1', 'failed')],
      },
    });
    expect(html.match(/draggable="true"/g) ?? []).toHaveLength(1);
    expect(html).toContain('Kéo sang ngày khác để đổi lịch');
    expect(html.match(/<li/g)?.length).toBeGreaterThanOrEqual(7);
  });
});
