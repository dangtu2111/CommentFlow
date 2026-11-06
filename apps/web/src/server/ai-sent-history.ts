import {
  type AutoSentHistoryStore,
  createInMemoryHistoryStore,
  evaluateMarkedWrongSignal,
  type HistoryQuery,
  type MarkWrongRole,
} from '@flow/ai';

/**
 * Lịch sử AI đã gửi + Đánh dấu sai (FR-075). `workspaceId`/`userId`/`role` lấy từ `requireAppUser`, không từ
 * client. Q-ASH1: chưa có bảng `drafts`/`automation_events` nên store hiện là bản bộ nhớ RỖNG (không dữ liệu
 * giả); bản DB cắm vào ở `AI-SENT-HISTORY-DB` bằng cách đổi `store` trong `aiSentHistory()`.
 */
type Ctx = { workspaceId: string; userId: string; role: MarkWrongRole };
type Deps = { store: AutoSentHistoryStore; now: () => Date };
export type MarkWrongResult = 'ok' | 'not_found' | 'already_marked' | 'reason_too_long';

export function createAiSentHistoryService({ store, now }: Deps) {
  return {
    async list(ctx: Ctx, query: HistoryQuery) {
      const [page, all] = await Promise.all([
        store.list(ctx.workspaceId, query),
        store.all(ctx.workspaceId),
      ]);
      return { page, signal: evaluateMarkedWrongSignal(all, now()) };
    },

    async markWrong(ctx: Ctx, id: string, reason: string | null): Promise<MarkWrongResult> {
      const outcome = await store.markWrong(
        ctx.workspaceId,
        id,
        { userId: ctx.userId, role: ctx.role },
        reason,
        now(),
      );
      if (outcome.ok) return 'ok';
      // `forbidden` không xảy ra: vai trò đã được `requireAppUser` giới hạn ở owner/staff.
      return outcome.code === 'forbidden' ? 'not_found' : outcome.code;
    },
  };
}

let service: ReturnType<typeof createAiSentHistoryService> | undefined;
export const aiSentHistory = () => {
  service ??= createAiSentHistoryService({
    store: createInMemoryHistoryStore(),
    now: () => new Date(),
  });
  return service;
};
