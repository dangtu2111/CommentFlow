'use server';

import {
  acquireCommentLock,
  cancelCommentReply,
  ReplyRejectedError,
  releaseCommentLock,
  requestCommentReply,
} from '@flow/db/runtime';
import { SEND_QUEUE } from '@flow/shared';
import { z } from 'zod';
import type { LockActionResult } from '../../../../lib/comment-lock-result';
import { getDb } from '../../../../server/db';
import { enqueueJob } from '../../../../server/queue';
import { createReplyAction, type ReplyActionResult } from '../../../../server/reply-action';
import { requireAppUser } from '../../../../server/require-app-user';

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
