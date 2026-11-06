import { describe, expect, it } from 'vitest';
import { AI_SENT_PAGE_SIZE, parseAiSentFilter, parseMarkWrongForm } from './ai-sent-form';

const form = (entries: Record<string, string>) => ({ get: (k: string) => entries[k] ?? null });
const ID = '3f2b8c1e-5a7d-4e2f-9b1a-0c4d6e8f1a2b';

describe('FR-075 trang AI đã gửi: đọc bộ lọc từ URL', () => {
  it('mặc định mọi trạng thái, trang 1; giá trị lạ bị bỏ', () => {
    expect(parseAiSentFilter({})).toEqual({ status: 'all', limit: AI_SENT_PAGE_SIZE, offset: 0 });
    expect(parseAiSentFilter({ status: 'xyz', page: 'abc' })).toEqual({
      status: 'all',
      limit: AI_SENT_PAGE_SIZE,
      offset: 0,
    });
    expect(parseAiSentFilter({ status: ['sent'] }).status).toBe('all');
  });

  it('nhận sent / marked_wrong và số trang; trang < 1 hoặc quá lớn → trang 1', () => {
    expect(parseAiSentFilter({ status: 'marked_wrong', page: '3' })).toEqual({
      status: 'marked_wrong',
      limit: AI_SENT_PAGE_SIZE,
      offset: 2 * AI_SENT_PAGE_SIZE,
    });
    expect(parseAiSentFilter({ page: '0' }).offset).toBe(0);
    expect(parseAiSentFilter({ page: '-4' }).offset).toBe(0);
    expect(parseAiSentFilter({ page: '999999' }).offset).toBe(0);
  });
});

describe('FR-075 form Đánh dấu sai', () => {
  it('id hợp lệ + lý do tùy chọn', () => {
    expect(parseMarkWrongForm(form({ id: ID, reason: ' sai giá ' }))).toEqual({
      ok: true,
      id: ID,
      reason: ' sai giá ',
    });
    expect(parseMarkWrongForm(form({ id: ID }))).toEqual({ ok: true, id: ID, reason: null });
  });

  it('id thiếu/không phải uuid → bad_request (nơi gọi trả 404)', () => {
    expect(parseMarkWrongForm(form({}))).toEqual({ ok: false, code: 'bad_request' });
    expect(parseMarkWrongForm(form({ id: 'abc' }))).toEqual({ ok: false, code: 'bad_request' });
  });
});
