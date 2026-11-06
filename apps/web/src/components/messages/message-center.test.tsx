import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getMessages } from '../../i18n/messages';
import {
  MESSAGES_CONVERSATIONS,
  MESSAGES_CUSTOMER,
  MESSAGES_INTENTS,
  MESSAGES_NOW,
  MESSAGES_STATS,
  MESSAGES_TAB_COUNTS,
  MESSAGES_THREAD,
} from '../../lib/messages-sample';
import { MessageCenter, type MessageCenterProps } from './message-center';

function render(overrides: Partial<MessageCenterProps> = {}) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="vi" messages={getMessages('vi')}>
      <MessageCenter
        now={MESSAGES_NOW}
        activeTab="pending"
        tabCounts={MESSAGES_TAB_COUNTS}
        stats={MESSAGES_STATS}
        intents={MESSAGES_INTENTS}
        selectedIntent={MESSAGES_INTENTS[0] ?? ''}
        conversations={MESSAGES_CONVERSATIONS}
        activeId="a"
        thread={MESSAGES_THREAD}
        customer={MESSAGES_CUSTOMER}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

describe('MessageCenter (Tailwind, đủ thành phần)', () => {
  const html = render();

  it('bọc trong khung .tw và đủ 4 cột + dải phân luồng', () => {
    expect(html).toContain('class="tw"');
    for (const label of [
      'Bộ lọc trạng thái',
      'Danh sách hội thoại',
      'Khung hội thoại',
      'Thông tin khách hàng',
    ]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('Phím tắt nhanh:');
  });

  it('có đủ 8 tab trạng thái kèm số đếm, tab đang chọn có aria-current', () => {
    for (const label of [
      'Sắp hết 24h',
      'Chờ duyệt',
      'Cần nhân viên',
      'AI đang trả lời',
      'Sẽ tự gửi',
      'Gửi lỗi',
      'Đã xong',
      'Tất cả',
    ]) {
      expect(html).toContain(label);
    }
    expect(html.match(/aria-current="true"/g)?.length).toBe(2); // tab "Chờ duyệt" + hội thoại đang mở
  });

  it('nút/ô chưa có chức năng vô hiệu kèm chú thích "Sắp có"', () => {
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="Sắp có"');
    expect(html).not.toContain('href=');
  });

  it('chip đếm ngược chuyển cảnh báo khi còn dưới 2 giờ', () => {
    // hội thoại "a": tin cuối của khách cách 22,25 giờ → còn 1g 45p
    expect(html).toContain('animate-pulse');
    expect(html).toContain('Còn 1g 45p');
  });

  it('quá 24 giờ chỉ nhân viên trả lời; quá 7 ngày khóa ô soạn', () => {
    const humanAgent = render({
      conversations: MESSAGES_CONVERSATIONS.map((c) => ({
        ...c,
        lastCustomerMessageAt: new Date(MESSAGES_NOW.getTime() - 30 * 3_600_000),
      })),
    });
    expect(humanAgent).toContain('Đã quá 24 giờ');
    const locked = render({
      conversations: MESSAGES_CONVERSATIONS.map((c) => ({
        ...c,
        lastCustomerMessageAt: new Date(MESSAGES_NOW.getTime() - 8 * 24 * 3_600_000),
      })),
    });
    expect(locked).toContain('Không thể soạn tin');
    expect(locked).toMatch(/<textarea[^>]*disabled/);
  });
});
