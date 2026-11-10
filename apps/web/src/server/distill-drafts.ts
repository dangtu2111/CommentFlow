import {
  approveDraftFaq,
  countDraftFaqs,
  type Database,
  type DraftFaqRow,
  type FlowDb,
  listDraftFaqs,
  rejectDraftFaq,
} from '@flow/db/runtime';
import { getDb } from './db';
import { requestKbSync } from './kb-sync-request';

/**
 * Gợi ý chắt lọc chờ Owner duyệt (M3, KB-DISTILL). Mọi truy vấn trong MỘT giao dịch `withActor` (RLS: chỉ Owner ghi). `workspaceId`/`userId` lấy từ
 * `requireAppUser`, không từ client. Duyệt = đổi `draft` → `published` rồi xếp đồng bộ kiến thức (gợi ý vào bản nháp kiến thức; xuất bản vẫn do Owner bấm).
 * Từ chối = xóa gợi ý. Id lạ/workspace khác/đã xử lý → `not_found`.
 */
type Ctx = { workspaceId: string; userId: string };
type Deps = {
  db: Pick<FlowDb, 'withActor'>;
  ops: {
    list: typeof listDraftFaqs;
    count: typeof countDraftFaqs;
    approve: typeof approveDraftFaq;
    reject: typeof rejectDraftFaq;
  };
  requestSync: (workspaceId: string) => Promise<void>;
};

export function createDistillDraftService({ db, ops, requestSync }: Deps) {
  return {
    list: (ctx: Ctx): Promise<DraftFaqRow[]> =>
      db.withActor(ctx.workspaceId, ctx.userId, (tx: Database) => ops.list(tx, ctx.workspaceId)),

    count: (ctx: Ctx): Promise<number> =>
      db.withActor(ctx.workspaceId, ctx.userId, (tx: Database) => ops.count(tx, ctx.workspaceId)),

    approve: async (ctx: Ctx, id: string): Promise<'ok' | 'not_found'> => {
      const found = await db.withActor(ctx.workspaceId, ctx.userId, (tx: Database) =>
        ops.approve(tx, ctx.workspaceId, id),
      );
      if (!found) return 'not_found';
      await requestSync(ctx.workspaceId);
      return 'ok';
    },

    reject: async (ctx: Ctx, id: string): Promise<'ok' | 'not_found'> => {
      const found = await db.withActor(ctx.workspaceId, ctx.userId, (tx: Database) =>
        ops.reject(tx, ctx.workspaceId, id),
      );
      return found ? 'ok' : 'not_found';
    },
  };
}

export const distillDrafts = () =>
  createDistillDraftService({
    db: getDb(),
    ops: {
      list: listDraftFaqs,
      count: countDraftFaqs,
      approve: approveDraftFaq,
      reject: rejectDraftFaq,
    },
    requestSync: requestKbSync,
  });
