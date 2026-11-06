import { type Database, type FlowDb, listRecentCommentTexts } from '@flow/db/runtime';
import {
  PREVIEW_WINDOW_DAYS,
  previewSpamRule,
  type SpamPreview,
  type SpamRule,
} from '@flow/shared';
import { getDb } from './db';

/**
 * Quy tắc spam (FR-080, US-050, UF-4). Xem trước: đọc bình luận 7 ngày của workspace trong MỘT giao dịch `withActor`
 * (chỉ đọc, không đổi bình luận), khớp bằng hàm thuần ở `@flow/shared`. `workspaceId`/`userId` lấy từ
 * `requireAppUser`, không từ client. Q-SPR1.
 *
 * Lưu quy tắc cần bảng `rules` (docs/10 §3.5; migration chỉ làn b): `SpamRuleStore` là interface cho bản DB sau này;
 * chưa có kho → `save` trả `unavailable` và KHÔNG ghi gì. Quy tắc chỉ đánh dấu/bỏ qua; không có đường tự ẩn ở đây.
 */
type Ctx = { workspaceId: string; userId: string };

/** Kho lưu quy tắc (bản DB do làn b: `rules` + RLS ghi bằng `withActor`, Owner). */
export type SpamRuleStore = {
  create(tx: Database, workspaceId: string, rule: SpamRule): Promise<void>;
};

type Deps = {
  db: Pick<FlowDb, 'withActor'>;
  ops: { listRecentCommentTexts: typeof listRecentCommentTexts };
  store?: SpamRuleStore;
};

export function createSpamRulesService({ db, ops, store }: Deps) {
  return {
    preview: (ctx: Ctx, rule: SpamRule): Promise<SpamPreview> =>
      db.withActor(ctx.workspaceId, ctx.userId, async (tx: Database) => {
        const rows = await ops.listRecentCommentTexts(tx, ctx.workspaceId, {
          days: PREVIEW_WINDOW_DAYS,
        });
        return previewSpamRule(rule, rows);
      }),

    save: async (ctx: Ctx, rule: SpamRule): Promise<'ok' | 'unavailable'> => {
      if (!store) return 'unavailable';
      await db.withActor(ctx.workspaceId, ctx.userId, (tx: Database) =>
        store.create(tx, ctx.workspaceId, rule),
      );
      return 'ok';
    },
  };
}

export const spamRules = () =>
  createSpamRulesService({ db: getDb(), ops: { listRecentCommentTexts } });
