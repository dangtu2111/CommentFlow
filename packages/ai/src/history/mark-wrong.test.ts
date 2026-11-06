import { describe, expect, it } from 'vitest';
import type { AutoSentRecord } from './auto-sent-record';
import { decideMarkWrong, MAX_WRONG_REASON_LENGTH } from './mark-wrong';

const sent: AutoSentRecord = {
  id: 'r1',
  workspaceId: 'ws1',
  channelId: 'ch1',
  targetType: 'comment',
  targetId: 'c1',
  text: 'Dạ còn hàng ạ',
  lang: 'vi',
  label: 'price_stock',
  confidence: 0.9,
  sentAt: new Date('2026-11-06T10:00:00Z'),
  status: 'sent',
  markedWrongAt: null,
  markedWrongBy: null,
  wrongReason: null,
};
const now = new Date('2026-11-06T11:00:00Z');
const actor = { userId: 'u1', role: 'staff' as const };

describe('FR-075 Đánh dấu sai một câu AI đã gửi', () => {
  it('bản ghi đã gửi → marked_wrong kèm người, giờ, lý do đã trim', () => {
    const r = decideMarkWrong(sent, actor, '  sai giá  ', now);
    expect(r).toEqual({
      ok: true,
      record: {
        ...sent,
        status: 'marked_wrong',
        markedWrongAt: now,
        markedWrongBy: 'u1',
        wrongReason: 'sai giá',
      },
    });
  });

  it('không có lý do (null/rỗng/khoảng trắng) → lý do null', () => {
    for (const reason of [null, undefined, '', '   ']) {
      const r = decideMarkWrong(sent, actor, reason, now);
      expect(r.ok && r.record.wrongReason).toBeNull();
    }
  });

  it('Owner cũng được; vai trò lạ → forbidden', () => {
    expect(decideMarkWrong(sent, { userId: 'u2', role: 'owner' }, null, now).ok).toBe(true);
    expect(decideMarkWrong(sent, { userId: 'u2', role: 'viewer' as never }, null, now)).toEqual({
      ok: false,
      code: 'forbidden',
    });
  });

  it('đánh dấu lần hai → already_marked, không đổi người/giờ', () => {
    const first = decideMarkWrong(sent, actor, 'a', now);
    if (!first.ok) throw new Error('cần ok');
    const again = decideMarkWrong(first.record, { userId: 'u9', role: 'owner' }, 'b', new Date());
    expect(again).toEqual({ ok: false, code: 'already_marked' });
  });

  it('lý do đúng giới hạn qua, dài hơn 1 ký tự → reason_too_long', () => {
    expect(decideMarkWrong(sent, actor, 'x'.repeat(MAX_WRONG_REASON_LENGTH), now).ok).toBe(true);
    expect(decideMarkWrong(sent, actor, 'x'.repeat(MAX_WRONG_REASON_LENGTH + 1), now)).toEqual({
      ok: false,
      code: 'reason_too_long',
    });
  });
});
