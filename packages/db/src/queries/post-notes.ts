import type { PostAutoOverride, PostNoteInput } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Ghi chú theo bài có hạn + ghi đè chế độ tự động theo bài (FR-062, migration 0045, Q-PN1). Đầu vào ghi PHẢI đã qua
 * `parsePostNoteInput` / `parsePostAutoOverride` (`@flow/shared`). Ghi: `withActor` (Owner) hoặc `withJob`;
 * RLS chặn Staff, workspace khác, người ngoài. Bài không thuộc workspace → lỗi khóa ngoại 23503.
 */
export type PostNoteRow = {
  id: string;
  postId: string;
  content: string;
  validFrom: Date;
  validTo: Date | null;
};

type RawNote = {
  id: string;
  post_id: string;
  content: string;
  valid_from: Date;
  valid_to: Date | null;
};

const toNote = (r: RawNote): PostNoteRow => ({
  id: r.id,
  postId: r.post_id,
  content: r.content,
  validFrom: r.valid_from,
  validTo: r.valid_to,
});

/** `validFrom` null → now() của DB. */
export async function createPostNote(
  tx: Database,
  workspaceId: string,
  postId: string,
  input: PostNoteInput,
): Promise<string> {
  const r = await tx.execute<{ id: string }>(sql`
    INSERT INTO cf.post_notes (workspace_id, post_id, content, valid_from, valid_to)
    VALUES (${workspaceId}::uuid, ${postId}::uuid, ${input.content},
      COALESCE(${input.validFrom?.toISOString() ?? null}::timestamptz, now()),
      ${input.validTo?.toISOString() ?? null}::timestamptz)
    RETURNING id`);
  const row = r.rows[0];
  if (!row) throw new Error('insert post_notes không trả dòng nào');
  return row.id;
}

/**
 * Sửa nội dung/hạn. `validFrom` null → giữ nguyên ngày bắt đầu cũ (không đặt lại về now()). `false` khi không thấy.
 * Ràng buộc `valid_to > valid_from` do CHECK ở DB bắt (23514) kể cả khi chỉ đổi một phía.
 */
export async function updatePostNote(
  tx: Database,
  workspaceId: string,
  id: string,
  input: PostNoteInput,
): Promise<boolean> {
  const r = await tx.execute(sql`
    UPDATE cf.post_notes SET content = ${input.content},
      valid_from = COALESCE(${input.validFrom?.toISOString() ?? null}::timestamptz, valid_from),
      valid_to = ${input.validTo?.toISOString() ?? null}::timestamptz, updated_at = now()
    WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid`);
  return (r.rowCount ?? 0) > 0;
}

/** `false` khi id không thấy được (workspace khác, đã xóa). */
export async function deletePostNote(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const r = await tx.execute(
    sql`DELETE FROM cf.post_notes WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid`,
  );
  return (r.rowCount ?? 0) > 0;
}

/** Mọi ghi chú của bài cho màn quản trị (cả hết hạn/chưa tới hạn), mới bắt đầu trước. */
export async function listPostNotes(
  tx: Database,
  workspaceId: string,
  postId: string,
): Promise<PostNoteRow[]> {
  const r = await tx.execute<RawNote>(sql`
    SELECT id, post_id, content, valid_from, valid_to FROM cf.post_notes
    WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid
    ORDER BY valid_from DESC, id`);
  return r.rows.map(toNote);
}

/**
 * Ghi chú ĐANG hiệu lực tại `at` (dùng khi trả lời): `valid_from <= at` và (không hạn hoặc `at < valid_to`) —
 * cùng biên với `postNoteStatus`. Hết hạn thì không trả về.
 */
export async function listActivePostNotes(
  tx: Database,
  workspaceId: string,
  postId: string,
  at: Date,
): Promise<PostNoteRow[]> {
  const r = await tx.execute<RawNote>(sql`
    SELECT id, post_id, content, valid_from, valid_to FROM cf.post_notes
    WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid
      AND valid_from <= ${at.toISOString()}::timestamptz
      AND (valid_to IS NULL OR ${at.toISOString()}::timestamptz < valid_to)
    ORDER BY valid_from DESC, id`);
  return r.rows.map(toNote);
}

/** Đặt (`off`/`shadow`) hoặc bỏ (`null`) ghi đè chế độ tự động của bài. Chỉ siết, DB CHECK chặn `auto`. */
export async function setPostAutoOverride(
  tx: Database,
  workspaceId: string,
  postId: string,
  mode: PostAutoOverride | null,
): Promise<void> {
  if (mode === null) {
    await tx.execute(sql`
      DELETE FROM cf.post_auto_overrides
      WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid`);
    return;
  }
  await tx.execute(sql`
    INSERT INTO cf.post_auto_overrides (workspace_id, post_id, mode)
    VALUES (${workspaceId}::uuid, ${postId}::uuid, ${mode})
    ON CONFLICT (workspace_id, post_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = now()`);
}

/** `null` = không ghi đè (theo chế độ nền). */
export async function getPostAutoOverride(
  tx: Database,
  workspaceId: string,
  postId: string,
): Promise<PostAutoOverride | null> {
  const r = await tx.execute<{ mode: PostAutoOverride }>(sql`
    SELECT mode FROM cf.post_auto_overrides
    WHERE workspace_id = ${workspaceId}::uuid AND post_id = ${postId}::uuid`);
  return r.rows[0]?.mode ?? null;
}
