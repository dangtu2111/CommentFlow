import { type AutoSentRecord, createInMemoryHistoryStore } from '@flow/ai';
import { describe, expect, it } from 'vitest';
import { createAiSentHistoryService } from './ai-sent-history';

const ID = '3f2b8c1e-5a7d-4e2f-9b1a-0c4d6e8f1a2b';
const rec = (id: string, workspaceId: string): AutoSentRecord => ({
  id,
  workspaceId,
  channelId: 'ch1',
  targetType: 'comment',
  targetId: 'c1',
  text: 'Dạ shop còn hàng ạ',
  lang: 'vi',
  label: 'price_stock',
  confidence: 0.91,
  sentAt: new Date('2026-11-06T10:00:00Z'),
  status: 'sent',
  markedWrongAt: null,
  markedWrongBy: null,
  wrongReason: null,
});
const now = new Date('2026-11-06T11:00:00Z');
const ctx = { workspaceId: 'ws1', userId: 'u1', role: 'staff' as const };
const filter = { status: 'all' as const, limit: 50, offset: 0 };

describe('FR-075 dịch vụ lịch sử AI đã gửi (web)', () => {
  const service = () =>
    createAiSentHistoryService({
      store: createInMemoryHistoryStore([rec(ID, 'ws1'), rec('other', 'ws2')]),
      now: () => now,
    });

  it('list chỉ trả bản ghi của workspace trong ngữ cảnh, kèm tín hiệu tỷ lệ sai', async () => {
    const r = await service().list(ctx, filter);
    expect(r.page.items.map((i) => i.id)).toEqual([ID]);
    expect(r.signal).toMatchObject({ pause: false, sent: 1, wrong: 0 });
  });

  it('Staff Đánh dấu sai được; lần hai → already_marked', async () => {
    const s = service();
    expect(await s.markWrong(ctx, ID, ' sai ')).toBe('ok');
    expect(await s.markWrong(ctx, ID, null)).toBe('already_marked');
    const r = await s.list(ctx, { ...filter, status: 'marked_wrong' });
    expect(r.page.items[0]).toMatchObject({ markedWrongBy: 'u1', wrongReason: 'sai' });
  });

  it('id của workspace khác → not_found (nơi gọi trả 404), bản ghi kia không đổi', async () => {
    const s = service();
    expect(await s.markWrong(ctx, 'other', null)).toBe('not_found');
    const other = await s.list({ ...ctx, workspaceId: 'ws2' }, filter);
    expect(other.page.items[0]?.status).toBe('sent');
  });

  it('lý do quá dài → reason_too_long', async () => {
    expect(await service().markWrong(ctx, ID, 'x'.repeat(301))).toBe('reason_too_long');
  });
});
