import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildDigest,
  buildSingleMessage,
  DIGEST_MAX_ITEMS,
  type PendingNotification,
  planDigests,
} from './notification-digest';

const item = (over: Partial<PendingNotification> = {}): PendingNotification => ({
  userId: 'u1',
  workspaceId: 'w1',
  channel: 'push',
  event: 'needs_human',
  count: 1,
  createdAt: new Date('2026-11-06T05:00:00Z'),
  ...over,
});

describe('FR-084 gom thông báo', () => {
  it('gom theo (workspace, người dùng, kênh); không trộn workspace/người dùng khác', () => {
    const groups = planDigests([
      item(),
      item({ event: 'pending_review' }),
      item({ userId: 'u2' }),
      item({ workspaceId: 'w2' }),
      item({ channel: 'email' }),
    ]);
    expect(groups).toHaveLength(4);
    expect(
      groups.find((g) => g.userId === 'u1' && g.workspaceId === 'w1' && g.channel === 'push')
        ?.items,
    ).toHaveLength(2);
  });
  it('digest cộng số lượng theo loại, theo thứ tự cố định, và lẻ 1 mục thì gửi lẻ', () => {
    const d = buildDigest(
      [item({ count: 2 }), item({ count: 3 }), item({ event: 'pending_review', count: 1 })],
      'vi',
    );
    expect(d.totals).toEqual({ needs_human: 5, pending_review: 1 });
    expect(d.kind).toBe('digest');
    const single = buildDigest([item({ count: 4 })], 'en');
    expect(single.kind).toBe('single');
    expect(single.body).toContain('4');
  });
  it('trần số mục: phần vượt vẫn nằm trong tổng, không mất số đếm', () => {
    const many = Array.from({ length: DIGEST_MAX_ITEMS + 10 }, () => item());
    const d = buildDigest(many, 'vi');
    expect(d.totals.needs_human).toBe(DIGEST_MAX_ITEMS + 10);
  });
  it('tổng số lượng được bảo toàn (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 30 }),
        (counts) => {
          const d = buildDigest(
            counts.map((count) => item({ count })),
            'vi',
          );
          return (
            Object.values(d.totals).reduce((a, b) => a + b, 0) === counts.reduce((a, b) => a + b, 0)
          );
        },
      ),
    );
  });
  it('mục rỗng → ném lỗi có mã rõ', () => {
    expect(() => buildDigest([], 'vi')).toThrow('NOTIFICATION_DIGEST_EMPTY');
  });
});

describe('FR-084 nội dung không chứa PII', () => {
  it('chỉ nhãn chung + số lượng, không văn bản khách', () => {
    const m = buildSingleMessage('needs_human', 3, 'vi');
    expect(m.body).not.toMatch(/@|\d{9,}/);
    expect(m.title.length).toBeGreaterThan(0);
  });
  it('số lượng bị ép về số nguyên dương hữu hạn (property)', () => {
    fc.assert(
      fc.property(fc.oneof(fc.double(), fc.integer()), (n) => {
        const m = buildSingleMessage('pending_review', n, 'en');
        return !/NaN|Infinity|-\d/.test(m.body);
      }),
    );
  });
});
