import { describe, expect, it } from 'vitest';
import type { AutoSentRecord } from './auto-sent-record';
import { createInMemoryHistoryStore } from './memory-store';

const rec = (id: string, ws: string, minute: number): AutoSentRecord => ({
  id,
  workspaceId: ws,
  channelId: 'ch1',
  targetType: 'comment',
  targetId: `t-${id}`,
  text: `câu ${id}`,
  lang: 'vi',
  label: 'other',
  confidence: 0.9,
  sentAt: new Date(Date.UTC(2026, 10, 6, 10, minute)),
  status: 'sent',
  markedWrongAt: null,
  markedWrongBy: null,
  wrongReason: null,
});
const actor = { userId: 'u1', role: 'owner' as const };
const now = new Date('2026-11-06T12:00:00Z');
const query = (status: 'all' | 'sent' | 'marked_wrong', limit = 50, offset = 0) => ({
  status,
  limit,
  offset,
});

describe('FR-075 store lịch sử AI đã gửi (bộ nhớ)', () => {
  const store = () =>
    createInMemoryHistoryStore([
      rec('a', 'ws1', 1),
      rec('b', 'ws1', 3),
      rec('c', 'ws1', 2),
      rec('x', 'ws2', 9),
    ]);

  it('chỉ trả bản ghi của workspace, mới nhất trước', async () => {
    const page = await store().list('ws1', query('all'));
    expect(page.items.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(page.total).toBe(3);
  });

  it('phân trang theo limit/offset, total là tổng sau lọc', async () => {
    const page = await store().list('ws1', query('all', 2, 2));
    expect(page.items.map((r) => r.id)).toEqual(['a']);
    expect(page.total).toBe(3);
  });

  it('markWrong ghi nhận và lọc theo trạng thái thấy được', async () => {
    const s = store();
    expect(await s.markWrong('ws1', 'c', actor, ' sai ', now)).toEqual({ ok: true });
    const wrong = await s.list('ws1', query('marked_wrong'));
    expect(wrong.items.map((r) => [r.id, r.wrongReason])).toEqual([['c', 'sai']]);
    const sent = await s.list('ws1', query('sent'));
    expect(sent.items.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('id của workspace khác hoặc không có → not_found, bản ghi kia không đổi', async () => {
    const s = store();
    expect(await s.markWrong('ws1', 'x', actor, null, now)).toEqual({
      ok: false,
      code: 'not_found',
    });
    expect(await s.markWrong('ws1', 'zzz', actor, null, now)).toEqual({
      ok: false,
      code: 'not_found',
    });
    expect((await s.list('ws2', query('marked_wrong'))).total).toBe(0);
  });

  it('đánh dấu lặp → already_marked; lý do quá dài → reason_too_long', async () => {
    const s = store();
    await s.markWrong('ws1', 'a', actor, null, now);
    expect(await s.markWrong('ws1', 'a', actor, null, now)).toEqual({
      ok: false,
      code: 'already_marked',
    });
    expect(await s.markWrong('ws1', 'b', actor, 'x'.repeat(301), now)).toEqual({
      ok: false,
      code: 'reason_too_long',
    });
  });

  it('all trả toàn bộ bản ghi của workspace (cho tín hiệu lạm dụng)', async () => {
    expect((await store().all('ws1')).length).toBe(3);
  });

  it('store rỗng mặc định không có dữ liệu', async () => {
    const empty = await createInMemoryHistoryStore().list('ws1', query('all', 5));
    expect(empty.total).toBe(0);
  });
});
