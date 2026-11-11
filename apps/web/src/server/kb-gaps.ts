import {
  createFaqItem,
  type Database,
  type FlowDb,
  type KbGapFilter,
  listApprovedPolicyFacts,
  listKbGaps,
  setKbGapStatus,
} from '@flow/db/runtime';
import type { KbGapAction } from '../lib/kb-gaps-form';
import { getDb } from './db';

/**
 * Câu hỏi AI chưa trả lời được (FR-134, UF-11). Mọi truy vấn trong MỘT giao dịch `withActor` (RLS: Owner ghi,
 * workspace khác không thấy). `workspaceId`/`userId` lấy từ `requireAppUser`, không từ client.
 * Q-KG1: bổ sung = tạo FAQ rồi đánh dấu `resolved` ngay (chưa có luồng xuất bản phiên bản kiến thức).
 */
type Ctx = { workspaceId: string; userId: string };
type Ops = {
  listKbGaps: typeof listKbGaps;
  setKbGapStatus: typeof setKbGapStatus;
  createFaqItem: typeof createFaqItem;
  listApprovedPolicyFacts?: typeof listApprovedPolicyFacts;
};
type Deps = { db: Pick<FlowDb, 'withActor'>; ops: Ops };

const STATUS_OF = { resolve: 'resolved', ignore: 'ignored', reopen: 'open' } as const;

export function createKbGapService({ db, ops }: Deps) {
  return {
    list: (ctx: Ctx, filter: KbGapFilter) =>
      db.withActor(ctx.workspaceId, ctx.userId, (tx: Database) => ops.listKbGaps(tx, filter)),

    /** Thẻ chính sách ĐÃ DUYỆT (loại + lần cập nhật) để gắn huy hiệu "Có thẻ mới" cho gap. */
    approvedCards: (ctx: Ctx) =>
      db.withActor(ctx.workspaceId, ctx.userId, async (tx: Database) =>
        ops.listApprovedPolicyFacts
          ? (await ops.listApprovedPolicyFacts(tx, ctx.workspaceId)).map((fact) => ({
              kind: fact.kind as string,
              updatedAt: fact.updatedAt,
            }))
          : [],
      ),

    /** Một gap theo id TRONG workspace (RLS); không thấy → null. */
    find: (ctx: Ctx, gapId: string) =>
      db.withActor(ctx.workspaceId, ctx.userId, async (tx: Database) => {
        const rows = await ops.listKbGaps(tx, { limit: 500 });
        return rows.find((row) => row.id === gapId) ?? null;
      }),

    /** `not_found` khi gap không thấy được (id lạ/workspace khác): KHÔNG tạo FAQ. */
    apply: (ctx: Ctx, action: KbGapAction): Promise<'ok' | 'not_found'> =>
      db.withActor(ctx.workspaceId, ctx.userId, async (tx: Database) => {
        const found = await ops.setKbGapStatus(tx, action.gapId, STATUS_OF[action.intent]);
        if (!found) return 'not_found' as const;
        if (action.intent === 'resolve') await ops.createFaqItem(tx, ctx.workspaceId, action.faq);
        return 'ok' as const;
      }),
  };
}

export const kbGaps = () =>
  createKbGapService({
    db: getDb(),
    ops: { listKbGaps, setKbGapStatus, createFaqItem, listApprovedPolicyFacts },
  });
