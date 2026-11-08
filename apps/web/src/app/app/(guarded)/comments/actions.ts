'use server';

import {
  acquireCommentLock,
  cancelCommentHide,
  cancelCommentReply,
  getCommentDetail,
  HideRejectedError,
  ReplyRejectedError,
  relabelComments,
  releaseCommentLock,
  requestCommentHide,
  requestCommentReply,
  skipComments,
} from '@flow/db/runtime';
import { HIDE_QUEUE, PIPELINE_FLAG, PIPELINE_QUEUE, SEND_QUEUE } from '@flow/shared';
import { z } from 'zod';
import type { LockActionResult } from '../../../../lib/comment-lock-result';
import { type BulkResult, createBulkActions } from '../../../../server/bulk-action';
import { getDb } from '../../../../server/db';
import { getFlags } from '../../../../server/flags';
import { createHideAction, type HideActionResult } from '../../../../server/hide-action';
import { enqueueJob } from '../../../../server/queue';
import { createReplyAction, type ReplyActionResult } from '../../../../server/reply-action';
import { requireAppUser } from '../../../../server/require-app-user';
import {
  createSuggestionRequest,
  type SuggestionResult,
} from '../../../../server/suggestion-request';

const idSchema = z.uuid();

/**
 * Lấy/gia hạn khóa mềm bình luận (FR-041). Workspace và người dùng lấy từ phiên (`requireAppUser`), KHÔNG từ client;
 * `commentId` được kiểm UUID. Khóa chỉ là cảnh báo, không phải quyền gửi.
 */
export async function lockCommentAction(commentId: string): Promise<LockActionResult> {
  const { user, workspace } = await requireAppUser({});
  const id = idSchema.safeParse(commentId);
  if (!id.success) return { status: 'not_found' };
  const result = await getDb().withActor(workspace.id, user.id, (tx) =>
    acquireCommentLock(tx, workspace.id, id.data, user.id),
  );
  if (result.status === 'acquired')
    return { status: 'acquired', until: result.until.toISOString() };
  if (result.status === 'held') {
    return {
      status: 'held',
      holderId: result.holderId,
      holderName: result.holderName,
      until: result.until.toISOString(),
    };
  }
  return { status: 'not_found' };
}

/** Mở khóa khi đóng/chuyển bình luận (chỉ người đang giữ mở được; còn lại tự hết hạn sau 2 phút). */
export async function unlockCommentAction(commentId: string): Promise<void> {
  const { user, workspace } = await requireAppUser({});
  const id = idSchema.safeParse(commentId);
  if (!id.success) return;
  await getDb().withActor(workspace.id, user.id, (tx) =>
    releaseCommentLock(tx, workspace.id, id.data, user.id),
  );
}

/** Logic gửi trả lời (đầu vào, hàm DB, đẩy job `send`, bù hủy khi đẩy lỗi) — xem `server/reply-action.ts`. */
const sendReply = createReplyAction({
  request: (session, input) =>
    getDb().withActor(session.workspaceId, session.userId, (tx) => requestCommentReply(tx, input)),
  cancel: (session, replyId) =>
    getDb().withActor(session.workspaceId, session.userId, (tx) => cancelCommentReply(tx, replyId)),
  enqueue: (job) => enqueueJob(SEND_QUEUE, job),
  warn: (event) => console.warn(JSON.stringify(event)),
  isRejection: (error): error is ReplyRejectedError => error instanceof ReplyRejectedError,
});

/**
 * Gửi trả lời bình luận (FR-042). Workspace/người dùng lấy từ phiên (`requireAppUser`), KHÔNG từ client; quyền
 * thật do hàm DB `cf.request_comment_reply` quyết định. Trả kết quả có kiểu; lỗi không mang nội dung/mã kỹ thuật.
 */
export async function replyCommentAction(
  commentId: string,
  text: string,
): Promise<ReplyActionResult> {
  const { user, workspace } = await requireAppUser({});
  return sendReply({ workspaceId: workspace.id, userId: user.id }, commentId, text);
}

/** Logic ẩn/bỏ ẩn (đầu vào, hàm DB, đẩy job `hide`, bù hủy khi đẩy lỗi) — xem `server/hide-action.ts`. */
const changeHidden = createHideAction({
  request: (session, input) =>
    getDb().withActor(session.workspaceId, session.userId, (tx) => requestCommentHide(tx, input)),
  cancel: (session, hideId) =>
    getDb().withActor(session.workspaceId, session.userId, (tx) => cancelCommentHide(tx, hideId)),
  enqueue: (job) => enqueueJob(HIDE_QUEUE, job),
  warn: (event) => console.warn(JSON.stringify(event)),
  isRejection: (error): error is HideRejectedError => error instanceof HideRejectedError,
});

/**
 * Ẩn (`hide: true`) / bỏ ẩn (`hide: false`) bình luận (FR-044). Chỉ người bấm; không có đường tự động nào gọi hàm này.
 * Workspace/người dùng lấy từ phiên (`requireAppUser`), KHÔNG từ client; quyền thật do hàm DB `cf.request_comment_hide`
 * quyết định. Việc ẩn thật chạy ở worker; giao diện chỉ hiện "đã ẩn" sau khi nền tảng xác nhận.
 */
export async function hideCommentAction(
  commentId: string,
  hide: boolean,
): Promise<HideActionResult> {
  const { user, workspace } = await requireAppUser({});
  return changeHidden({ workspaceId: workspace.id, userId: user.id }, commentId, hide);
}

/**
 * Hành động hàng loạt (FR-045). Ẩn đi qua ĐÚNG đường ẩn từng bình luận ở trên (`changeHidden`); không có gửi hàng loạt.
 * Quyền thật do RLS/trigger/hàm DB quyết định; ở đây chỉ gom đầu vào + kết quả (xem `server/bulk-action.ts`).
 */
const bulk = createBulkActions({
  skip: (session, ids) =>
    getDb().withActor(session.workspaceId, session.userId, (tx) =>
      skipComments(tx, session.workspaceId, session.userId, ids),
    ),
  relabel: (session, ids, label) =>
    getDb().withActor(session.workspaceId, session.userId, (tx) =>
      relabelComments(tx, session.workspaceId, session.userId, ids, label),
    ),
  hide: (session, commentId, hide) => changeHidden(session, commentId, hide),
  warn: (event) => console.warn(JSON.stringify(event)),
});

/** Bỏ qua nhiều bình luận (chuyển `skipped`). Workspace/người dùng từ phiên, KHÔNG từ client. */
export async function skipCommentsAction(commentIds: string[]): Promise<BulkResult> {
  const { user, workspace } = await requireAppUser({});
  return bulk.skipMany({ workspaceId: workspace.id, userId: user.id }, commentIds);
}

/** Đổi nhãn nhiều bình luận; nhãn phải thuộc bộ chuẩn (`@flow/shared`). */
export async function relabelCommentsAction(
  commentIds: string[],
  label: string,
): Promise<BulkResult> {
  const { user, workspace } = await requireAppUser({});
  return bulk.relabelMany({ workspaceId: workspace.id, userId: user.id }, commentIds, label);
}

/** Ẩn nhiều bình luận; server BẮT BUỘC `confirmed === true` (hộp xác nhận ở giao diện). */
export async function hideCommentsAction(
  commentIds: string[],
  confirmed: boolean,
): Promise<BulkResult> {
  const { user, workspace } = await requireAppUser({});
  return bulk.hideMany({ workspaceId: workspace.id, userId: user.id }, commentIds, confirmed);
}

/** Logic "Soạn gợi ý" (kiểm điều kiện, đẩy job `pipeline` thủ công kèm người bấm) — xem `server/suggestion-request.ts`. */
const askForSuggestion = createSuggestionRequest({
  find: async (session, commentId) => {
    const detail = await getDb().withActor(session.workspaceId, session.userId, (tx) =>
      getCommentDetail(tx, session.workspaceId, commentId, session.userId),
    );
    return detail ? { status: detail.status, deletedAt: detail.deletedAt } : null;
  },
  enqueue: (job, options) => enqueueJob(PIPELINE_QUEUE, job, options),
  // Cờ DB `cf.pipeline.v2` theo workspace (thay PIPELINE_ENABLED); web nhớ cờ ≤ 30 giây.
  pipelineEnabled: (workspaceId) => getFlags().isEnabled(PIPELINE_FLAG, { workspaceId }),
  warn: (event) => console.warn(JSON.stringify(event)),
});

/**
 * Nút "Soạn gợi ý" (PIPE-ORCHESTRATOR lát F, Q-POR8): nhân viên (Owner hoặc Staff) yêu cầu AI soạn gợi ý cho bình luận chưa có bản nháp hoặc
 * đang "Cần nhân viên". Workspace/người dùng lấy từ phiên (`requireAppUser`), KHÔNG từ client. Không gửi gì cho khách; AI chỉ soạn, người bấm gửi.
 */
export async function requestSuggestionAction(commentId: string): Promise<SuggestionResult> {
  const { user, workspace } = await requireAppUser({});
  return askForSuggestion({ workspaceId: workspace.id, userId: user.id }, commentId);
}
