import { parseBulkIds, parseBulkLabel } from '../lib/bulk-input';
import type { HideActionResult, HideFailure, HideSession } from './hide-action';

/**
 * Hành động hàng loạt trong inbox (FR-045, US-010), tách khỏi Server Action để test với phụ thuộc được tiêm.
 *  - Bỏ qua / Đổi nhãn: MỘT câu UPDATE có điều kiện ở tầng DB, trả về các id THỰC SỰ đổi; id còn lại (workspace khác,
 *    trạng thái không cho phép, đang bị người khác khóa, đã xóa) gộp chung `not_applicable` — không lộ id có tồn tại không.
 *  - Ẩn: đi qua đường ẩn từng bình luận (`hide`, ADR 009) tuần tự; BẮT BUỘC `confirmed === true` ở server (không chỉ ở
 *    giao diện). Không có đường gửi hàng loạt và AI không gọi vào đây. Log CHỈ có tên sự kiện/tên lỗi.
 */
export type BulkRejection =
  | 'invalid_input'
  | 'too_many'
  | 'invalid_label'
  | 'confirm_required'
  | 'unavailable';
export type BulkFailureReason = HideFailure | 'not_applicable';

export type BulkResult =
  | {
      ok: true;
      requested: number;
      done: number;
      reasons: Partial<Record<BulkFailureReason, number>>;
    }
  | { ok: false; reason: BulkRejection };

export type BulkActionDeps = {
  /** Trả các id đã chuyển sang `skipped`. */
  skip: (session: HideSession, ids: string[]) => Promise<string[]>;
  /** Trả các id đã đổi nhãn. */
  relabel: (session: HideSession, ids: string[], label: string) => Promise<string[]>;
  /** Đường ẩn một bình luận (`createHideAction`). */
  hide: (session: HideSession, commentId: string, hide: boolean) => Promise<HideActionResult>;
  warn: (event: { event: string; reason?: string }) => void;
};

const errorName = (error: unknown) => (error instanceof Error ? error.name : 'unknown');

function summarize(
  requested: number,
  done: number,
  reasons: Partial<Record<BulkFailureReason, number>>,
): BulkResult {
  return { ok: true, requested, done, reasons };
}

export function createBulkActions(deps: BulkActionDeps) {
  async function applyUpdate(
    event: string,
    ids: string[],
    run: () => Promise<string[]>,
  ): Promise<BulkResult> {
    let changed: string[];
    try {
      changed = await run();
    } catch (error) {
      deps.warn({ event, reason: errorName(error) });
      return { ok: false, reason: 'unavailable' };
    }
    const missed = ids.length - changed.length;
    return summarize(ids.length, changed.length, missed > 0 ? { not_applicable: missed } : {});
  }

  return {
    async skipMany(session: HideSession, input: unknown): Promise<BulkResult> {
      const ids = parseBulkIds(input);
      if (!ids.ok) return ids;
      return applyUpdate('bulk_skip_failed', ids.ids, () => deps.skip(session, ids.ids));
    },

    async relabelMany(session: HideSession, input: unknown, label: unknown): Promise<BulkResult> {
      const ids = parseBulkIds(input);
      if (!ids.ok) return ids;
      const parsedLabel = parseBulkLabel(label);
      if (!parsedLabel.ok) return parsedLabel;
      return applyUpdate('bulk_relabel_failed', ids.ids, () =>
        deps.relabel(session, ids.ids, parsedLabel.label),
      );
    },

    async hideMany(session: HideSession, input: unknown, confirmed: unknown): Promise<BulkResult> {
      const ids = parseBulkIds(input);
      if (!ids.ok) return ids;
      if (confirmed !== true) return { ok: false, reason: 'confirm_required' };
      const reasons: Partial<Record<BulkFailureReason, number>> = {};
      let done = 0;
      for (const id of ids.ids) {
        const result = await deps.hide(session, id, true);
        if (result.ok) done += 1;
        else reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
      }
      return summarize(ids.ids.length, done, reasons);
    },
  };
}
