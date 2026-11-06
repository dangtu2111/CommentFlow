import { describe, expect, it } from 'vitest';
import type { Banner } from './channel-banner';
import { buildNotifications } from './notification-model';

const banner = (status: Banner['status'], names: string[], moreCount = 0): Banner => ({
  status,
  names,
  moreCount,
  audience: 'owner',
  urgent: status !== 'error',
});

describe('FR-012 hộp thông báo ở đầu trang (chỉ cảnh báo kênh thật)', () => {
  it('FR-012 không có cảnh báo → danh sách trống, không chấm đỏ', () => {
    expect(buildNotifications([], null)).toEqual({ items: [], hasUrgent: false });
  });

  it('FR-012 mỗi banner kênh một mục theo thứ tự đầu vào; hết hạn/thu hồi là khẩn', () => {
    const model = buildNotifications([banner('expired', ['A']), banner('error', ['B'], 2)], null);
    expect(model.items.map((i) => i.kind)).toEqual(['channel', 'channel']);
    expect(model.items[1]).toMatchObject({ status: 'error', names: ['B'], moreCount: 2 });
    expect(model.hasUrgent).toBe(true);
  });

  it('FR-023 webhook im lặng thành một mục riêng, không tính khẩn', () => {
    const model = buildNotifications([], { names: ['A'], moreCount: 0 });
    expect(model.items).toEqual([{ kind: 'webhookSilent', names: ['A'], moreCount: 0 }]);
    expect(model.hasUrgent).toBe(false);
  });

  it('FR-012 chỉ lỗi tạm (error) → có mục nhưng không khẩn', () => {
    expect(buildNotifications([banner('error', ['A'])], null).hasUrgent).toBe(false);
  });
});
