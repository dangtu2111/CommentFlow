import {
  type Database,
  getMaxAiRepliesPerCustomerPost,
  MAX_MAX_AI_REPLIES_PER_CUSTOMER_POST,
  MIN_MAX_AI_REPLIES_PER_CUSTOMER_POST,
  saveMaxAiRepliesPerCustomerPost,
} from '@flow/db/runtime';
import { getDb } from './db';

/**
 * Trần câu AI cho mỗi khách dưới mỗi bài trong 24 giờ (FR-167, Q-POR14): Owner chỉnh 1–5 ở Cài đặt › Tự động hóa. `workspaceId`/
 * `userId` lấy từ phiên server (`requireAppUser({role:'owner'})`), KHÔNG từ form. Ghi qua `withActor` nên RLS chỉ cho Owner của đúng
 * workspace ghi; giá trị đọc từ form được kiểm ở đây (số nguyên 1–5) TRƯỚC khi chạm DB, DB còn CHECK 1–5 làm chốt cuối.
 */
export const REPLY_CAP_MIN = MIN_MAX_AI_REPLIES_PER_CUSTOMER_POST;
export const REPLY_CAP_MAX = MAX_MAX_AI_REPLIES_PER_CUSTOMER_POST;

type Ctx = { workspaceId: string; userId: string };
type ActorDb = {
  withActor<T>(workspaceId: string, userId: string, fn: (tx: Database) => Promise<T>): Promise<T>;
};

/** Đọc ô form `maxAiReplies`: chỉ nhận chuỗi số nguyên dương 1–5 (không dấu cách thừa, không số thập phân, không số mũ). */
export function parseReplyCap(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9][0-9]?$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value >= REPLY_CAP_MIN && value <= REPLY_CAP_MAX ? value : null;
}

export type SaveReplyCapResult = { ok: true; value: number } | { ok: false };

export function createReplyCapService(db: ActorDb = getDbLazy()) {
  return {
    load(ctx: Ctx): Promise<number> {
      return db.withActor(ctx.workspaceId, ctx.userId, (tx) =>
        getMaxAiRepliesPerCustomerPost(tx, ctx.workspaceId),
      );
    },
    async save(ctx: Ctx, raw: unknown): Promise<SaveReplyCapResult> {
      const value = parseReplyCap(raw);
      if (value === null) return { ok: false };
      await db.withActor(ctx.workspaceId, ctx.userId, (tx) =>
        saveMaxAiRepliesPerCustomerPost(tx, ctx.workspaceId, ctx.userId, value),
      );
      return { ok: true, value };
    },
  };
}

/** Lười: không dựng kết nối DB lúc nạp module (next build không có DATABASE_URL). */
function getDbLazy(): ActorDb {
  return { withActor: (workspaceId, userId, fn) => getDb().withActor(workspaceId, userId, fn) };
}
