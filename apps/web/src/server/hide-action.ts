import { z } from 'zod';

/**
 * Logic của hành động "Ẩn / Bỏ ẩn" (FR-044, ADR 009), tách khỏi Server Action để test với phụ thuộc được tiêm.
 * Thứ tự: kiểm đầu vào → ghi yêu cầu (hàm DB kiểm quyền/trạng thái/khóa/kênh; idempotent) → đẩy job `hide`; đẩy lỗi →
 * bù hủy để không kẹt yêu cầu `queued`. Log CHỈ có tên sự kiện/tên lỗi. AI không có đường vào đây: chỉ người bấm.
 */
export type HideFailure =
  | 'not_found'
  | 'not_hideable'
  | 'locked_by_other'
  | 'channel_not_connected'
  | 'forbidden'
  | 'queue_unavailable'
  | 'unavailable';

/** `hideId: null` = không có việc mới (đã ở trạng thái đích hoặc đã có yêu cầu cùng chiều đang chạy). */
export type HideActionResult =
  | { ok: true; hideId: string | null }
  | { ok: false; reason: HideFailure };

export type HideSession = { workspaceId: string; userId: string };

export type HideActionDeps = {
  request: (
    session: HideSession,
    input: { commentId: string; hide: boolean },
  ) => Promise<string | null>;
  cancel: (session: HideSession, hideId: string) => Promise<boolean>;
  enqueue: (job: { workspaceId: string; hideId: string }) => Promise<void>;
  warn: (event: { event: string; reason?: string }) => void;
  /** Nhận ra lỗi từ chối nghiệp vụ của hàm DB (mang `reason`). */
  isRejection: (error: unknown) => error is { reason: string };
};

const REJECTIONS: readonly HideFailure[] = [
  'not_found',
  'not_hideable',
  'locked_by_other',
  'channel_not_connected',
  'forbidden',
];

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'unknown');

export function createHideAction(deps: HideActionDeps) {
  return async function hideAction(
    session: HideSession,
    commentId: string,
    hide: unknown,
  ): Promise<HideActionResult> {
    if (!z.uuid().safeParse(commentId).success) return { ok: false, reason: 'not_found' };
    if (typeof hide !== 'boolean') return { ok: false, reason: 'not_hideable' };

    let hideId: string | null;
    try {
      hideId = await deps.request(session, { commentId, hide });
    } catch (error) {
      if (deps.isRejection(error) && (REJECTIONS as readonly string[]).includes(error.reason)) {
        return { ok: false, reason: error.reason as HideFailure };
      }
      deps.warn({ event: 'hide_request_failed', reason: errorName(error) });
      return { ok: false, reason: 'unavailable' };
    }
    if (hideId === null) return { ok: true, hideId: null };

    try {
      await deps.enqueue({ workspaceId: session.workspaceId, hideId });
    } catch (error) {
      deps.warn({ event: 'hide_enqueue_failed', reason: errorName(error) });
      try {
        await deps.cancel(session, hideId);
      } catch (cancelError) {
        deps.warn({ event: 'hide_cancel_failed', reason: errorName(cancelError) });
      }
      return { ok: false, reason: 'queue_unavailable' };
    }
    return { ok: true, hideId };
  };
}
