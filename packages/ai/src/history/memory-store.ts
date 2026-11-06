import type { AutoSentRecord } from './auto-sent-record';
import { decideMarkWrong, type MarkWrongActor, type MarkWrongErrorCode } from './mark-wrong';

export type HistoryQuery = {
  status: 'all' | 'sent' | 'marked_wrong';
  limit: number;
  offset: number;
};
export type HistoryPage = { items: AutoSentRecord[]; total: number };
export type MarkWrongOutcome = { ok: true } | { ok: false; code: MarkWrongErrorCode | 'not_found' };

/**
 * Cổng truy cập lịch sử AI đã gửi. Mọi hàm nhận `workspaceId` (id của workspace khác → `not_found`, không lộ tồn
 * tại). Bản DB cắm vào sau migration (`AI-SENT-HISTORY-DB`); hiện có bản bộ nhớ dưới đây.
 */
export interface AutoSentHistoryStore {
  list(workspaceId: string, query: HistoryQuery): Promise<HistoryPage>;
  /** Mọi bản ghi của workspace (cho `evaluateMarkedWrongSignal`). */
  all(workspaceId: string): Promise<AutoSentRecord[]>;
  markWrong(
    workspaceId: string,
    id: string,
    actor: MarkWrongActor,
    reason: string | null | undefined,
    now: Date,
  ): Promise<MarkWrongOutcome>;
}

/** Bản trong bộ nhớ: fixture cho test và store rỗng của trang cho tới khi có bảng thật. */
export function createInMemoryHistoryStore(
  initial: readonly AutoSentRecord[] = [],
): AutoSentHistoryStore {
  const records = new Map<string, AutoSentRecord>(initial.map((r) => [r.id, r]));
  const ofWorkspace = (workspaceId: string) =>
    [...records.values()].filter((r) => r.workspaceId === workspaceId);

  return {
    async list(workspaceId, { status, limit, offset }) {
      const matching = ofWorkspace(workspaceId)
        .filter((r) => status === 'all' || r.status === status)
        .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
      return { items: matching.slice(offset, offset + limit), total: matching.length };
    },
    async all(workspaceId) {
      return ofWorkspace(workspaceId);
    },
    async markWrong(workspaceId, id, actor, reason, now) {
      const found = records.get(id);
      if (!found || found.workspaceId !== workspaceId) return { ok: false, code: 'not_found' };
      const decision = decideMarkWrong(found, actor, reason, now);
      if (!decision.ok) return decision;
      records.set(id, decision.record);
      return { ok: true };
    },
  };
}
