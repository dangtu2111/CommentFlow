'use server';

import { acquireCommentLock, releaseCommentLock } from '@flow/db/runtime';
import { z } from 'zod';
import type { LockActionResult } from '../../../../lib/comment-lock-result';
import { getDb } from '../../../../server/db';
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
