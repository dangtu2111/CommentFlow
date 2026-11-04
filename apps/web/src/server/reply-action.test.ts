import { describe, expect, it, vi } from 'vitest';
import { createReplyAction, type ReplyActionDeps } from './reply-action';

const UUID = '11111111-1111-4111-8111-111111111111';
const REPLY = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';

class Rejected extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function setup(over: Partial<ReplyActionDeps> = {}) {
  const request = vi.fn(async () => REPLY);
  const cancel = vi.fn(async () => true);
  const enqueue = vi.fn(async () => undefined);
  const warn = vi.fn();
  const act = createReplyAction({
    request,
    cancel,
    enqueue,
    warn,
    isRejection: (e): e is { reason: string } => e instanceof Rejected,
    ...over,
  });
  return { act, request, cancel, enqueue, warn };
}
const session = { workspaceId: WS, userId: USER };

describe('FR-042 createReplyAction — Gửi trả lời', () => {
  it('FR-042 thành công: ghi yêu cầu với nội dung đã cắt, đẩy job send {workspaceId, replyId}, trả queued', async () => {
    const { act, request, enqueue, cancel } = setup();
    const result = await act(session, UUID, '  Dạ còn size M ạ.\r\n ');
    expect(result).toEqual({ ok: true, replyId: REPLY });
    expect(request).toHaveBeenCalledWith(session, { commentId: UUID, text: 'Dạ còn size M ạ.' });
    expect(enqueue).toHaveBeenCalledWith({ workspaceId: WS, replyId: REPLY });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('FR-042 đầu vào sai (không phải UUID, nội dung rỗng/quá dài) → từ chối ngay, KHÔNG đụng DB/hàng đợi', async () => {
    const { act, request, enqueue } = setup();
    expect(await act(session, 'khong-phai-uuid', 'x')).toEqual({ ok: false, reason: 'not_found' });
    expect(await act(session, UUID, '   ')).toEqual({ ok: false, reason: 'empty' });
    expect(await act(session, UUID, 'a'.repeat(8001))).toEqual({ ok: false, reason: 'too_long' });
    expect(request).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('FR-042 DB từ chối (khóa người khác, kênh hỏng, không trả lời được…) → trả đúng lý do, KHÔNG đẩy job', async () => {
    for (const reason of [
      'not_found',
      'not_replyable',
      'locked_by_other',
      'channel_not_connected',
      'invalid_text',
      'forbidden',
    ]) {
      const { act, enqueue } = setup({
        request: async () => {
          throw new Rejected(reason);
        },
      });
      expect(await act(session, UUID, 'Dạ ạ'), reason).toEqual({ ok: false, reason });
      expect(enqueue).not.toHaveBeenCalled();
    }
  });

  it('FR-042 lỗi lạ khi ghi yêu cầu → "không gửi được" chung, log chỉ có tên lỗi (không nội dung)', async () => {
    const { act, warn } = setup({
      request: async () => {
        throw new Error('DB sập: Dạ còn size M ạ.');
      },
    });
    expect(await act(session, UUID, 'Dạ còn size M ạ.')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('size M');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('FR-042 đẩy job lỗi → bù hủy yêu cầu (bình luận về trạng thái trước) và báo "chưa gửi được"', async () => {
    const { act, cancel, warn } = setup({
      enqueue: async () => {
        throw new Error('queue sập');
      },
    });
    expect(await act(session, UUID, 'Dạ ạ')).toEqual({ ok: false, reason: 'queue_unavailable' });
    expect(cancel).toHaveBeenCalledWith(session, REPLY);
    expect(warn).toHaveBeenCalledWith({ event: 'reply_enqueue_failed', reason: 'Error' });
  });

  it('FR-042 đẩy job lỗi và bù hủy cũng lỗi → vẫn trả queue_unavailable (không ném), ghi nhận cả hai', async () => {
    const { act, warn } = setup({
      enqueue: async () => {
        throw new Error('queue sập');
      },
      cancel: async () => {
        throw new Error('DB sập');
      },
    });
    expect(await act(session, UUID, 'Dạ ạ')).toEqual({ ok: false, reason: 'queue_unavailable' });
    expect(warn).toHaveBeenCalledWith({ event: 'reply_cancel_failed', reason: 'Error' });
  });
});
