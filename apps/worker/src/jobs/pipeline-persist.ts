import {
  commentUpdateOf,
  type DonePipelineResult,
  handoffDraftInput,
  type PersistContext,
  toDraftInput,
  toGapInputs,
  toRetrievalInput,
} from '@flow/ai';
import {
  commentHasDraft,
  completePipelineTurn,
  type FlowDb,
  failPipelineTurn,
  finishCommentProcessing,
  handoffCommentIfProcessing,
  insertDraft,
  insertRetrievalLog,
  lockCommentForPersist,
  recordKbGap,
} from '@flow/db';
import { buildKbGapRecord, buildRetrievalLogRecord } from '@flow/shared';

/**
 * Ghi kết quả một lượt pipeline (PIPE-ORCHESTRATOR lát D, Q-POR6). MỘT giao dịch `withJob`: cập nhật bình luận, ghi bản nháp,
 * nhật ký tìm kiếm, lỗ hổng kiến thức, đóng khóa lượt. Idempotent: bước đầu là CAS `processing → trạng thái cuối` — bình luận đã
 * rời `processing` (chạy trùng/đã ghi) thì KHÔNG ghi gì thêm, nên chỉ có MỘT bản nháp cho một bình luận.
 */
export type PersistOutcome = { written: true; draftId: string } | { written: false };

export async function persistPipelineResult(
  db: FlowDb,
  workspaceId: string,
  result: DonePipelineResult,
  ctx: PersistContext,
  latencyMs: number,
): Promise<PersistOutcome> {
  return db.withJob(workspaceId, async (tx): Promise<PersistOutcome> => {
    const claimed = await finishCommentProcessing(
      tx,
      workspaceId,
      ctx.commentId,
      commentUpdateOf(result),
    );
    if (!claimed) return { written: false };
    const draftId = await insertDraft(tx, workspaceId, toDraftInput(result, ctx));
    await insertRetrievalLog(
      tx,
      workspaceId,
      buildRetrievalLogRecord({ ...toRetrievalInput(result, ctx, latencyMs), draftId }),
    );
    for (const gap of toGapInputs(result)) {
      await recordKbGap(tx, workspaceId, buildKbGapRecord(gap));
    }
    await completePipelineTurn(tx, workspaceId, ctx.commentId);
    return { written: true, draftId };
  });
}

/**
 * Bản nháp "Cần nhân viên" cho lượt bị chặn (hết lượt/hết lần thử) hoặc AI lỗi/đầu ra không đọc được. Bình luận sang `needs_human`
 * (nếu đang `processing`). Idempotent: đã có bản nháp thì không ghi thêm. `markFailed` đóng khóa lượt `failed` (lỗi AI).
 */
export async function persistHandoff(
  db: FlowDb,
  workspaceId: string,
  reason: string,
  ctx: PersistContext,
  options: { markFailed?: boolean } = {},
): Promise<PersistOutcome> {
  return db.withJob(workspaceId, async (tx): Promise<PersistOutcome> => {
    await lockCommentForPersist(tx, ctx.commentId);
    await handoffCommentIfProcessing(tx, workspaceId, ctx.commentId);
    if (options.markFailed) await failPipelineTurn(tx, workspaceId, ctx.commentId, reason);
    if (await commentHasDraft(tx, workspaceId, ctx.commentId)) return { written: false };
    const draftId = await insertDraft(tx, workspaceId, handoffDraftInput(reason, ctx));
    return { written: true, draftId };
  });
}
