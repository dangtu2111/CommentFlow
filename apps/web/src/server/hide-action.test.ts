import { describe, expect, it, vi } from 'vitest';
import { createHideAction, type HideActionDeps } from './hide-action';

const UUID = '11111111-1111-4111-8111-111111111111';
const HIDE = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';

class Rejected extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function setup(over: Partial<HideActionDeps> = {}) {
  const request = vi.fn(async (): Promise<string | null> => HIDE);
  const cancel = vi.fn(async () => true);
  const enqueue = vi.fn(async () => undefined);
  const warn = vi.fn();
  const act = createHideAction({
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

describe('FR-044 createHideAction — Ẩn / Bỏ ẩn', () => {
  it('FR-044 thành công: ghi yêu cầu, đẩy job hide {workspaceId, hideId}, trả id; bỏ ẩn dùng hide=false', async () => {
    const { act, request, enqueue, cancel } = setup();
    expect(await act(session, UUID, true)).toEqual({ ok: true, hideId: HIDE });
    expect(request).toHaveBeenCalledWith(session, { commentId: UUID, hide: true });
    expect(enqueue).toHaveBeenCalledWith({ workspaceId: WS, hideId: HIDE });
    await act(session, UUID, false);
    expect(request).toHaveBeenLastCalledWith(session, { commentId: UUID, hide: false });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('FR-044 đầu vào sai (không phải UUID, hide không phải boolean) → từ chối ngay, KHÔNG đụng DB/hàng đợi', async () => {
    const { act, request, enqueue } = setup();
    expect(await act(session, 'khong-phai-uuid', true)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    for (const bad of ['true', 1, null, undefined]) {
      expect(await act(session, UUID, bad)).toEqual({ ok: false, reason: 'not_hideable' });
    }
    expect(request).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('FR-044 idempotent: DB trả null (đã ở trạng thái đích/đã có yêu cầu) → ok, KHÔNG đẩy job', async () => {
    const { act, enqueue } = setup({ request: async () => null });
    expect(await act(session, UUID, true)).toEqual({ ok: true, hideId: null });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('FR-044 DB từ chối → trả đúng lý do, KHÔNG đẩy job', async () => {
    for (const reason of [
      'not_found',
      'not_hideable',
      'locked_by_other',
      'channel_not_connected',
      'forbidden',
    ]) {
      const { act, enqueue } = setup({
        request: async () => {
          throw new Rejected(reason);
        },
      });
      expect(await act(session, UUID, true), reason).toEqual({ ok: false, reason });
      expect(enqueue).not.toHaveBeenCalled();
    }
  });

  it('FR-044 lỗi lạ khi ghi yêu cầu → "unavailable", log chỉ có tên lỗi', async () => {
    const { act, warn } = setup({
      request: async () => {
        throw new Error('DB sập: nội dung bí mật');
      },
    });
    expect(await act(session, UUID, true)).toEqual({ ok: false, reason: 'unavailable' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('bí mật');
  });

  it('FR-044 đẩy job lỗi → bù hủy yêu cầu, trả queue_unavailable; hủy cũng lỗi vẫn trả queue_unavailable', async () => {
    const failing = setup({
      enqueue: async () => {
        throw new Error('boss sập');
      },
    });
    expect(await failing.act(session, UUID, true)).toEqual({
      ok: false,
      reason: 'queue_unavailable',
    });
    expect(failing.cancel).toHaveBeenCalledWith(session, HIDE);

    const both = setup({
      enqueue: async () => {
        throw new Error('boss sập');
      },
      cancel: async () => {
        throw new Error('cancel sập');
      },
    });
    expect(await both.act(session, UUID, true)).toEqual({ ok: false, reason: 'queue_unavailable' });
    expect(both.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'hide_cancel_failed' }),
    );
  });
});
