import { sql } from 'drizzle-orm';
import type { Database } from './client';

/**
 * Ảnh/video đính kèm bài đăng (migration 0092, COMPOSER-MEDIA, Q-PUB4). File nằm ở kho S3; DB giữ siêu dữ liệu và liên kết với bài. `cf_app` chỉ đọc; ghi qua hàm DEFINER:
 * Owner (`withActor`) đăng ký file và đặt danh sách file của bài; worker (`withJob`) đọc danh sách file để đăng; dọn file mồ côi ở ngữ cảnh trần của cf_worker (`withSystem`).
 */
export type MediaKind = 'image' | 'video';
export type MediaAssetRow = {
  id: string;
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
};

type Row = { id: string; kind: MediaKind; content_type: string; size_bytes: string | number };
const asAsset = (row: Row): MediaAssetRow => ({
  id: row.id,
  kind: row.kind,
  contentType: row.content_type,
  sizeBytes: Number(row.size_bytes),
});

/** Đăng ký một file ĐÃ có trong kho (Owner). Quá nhiều file chưa gắn bài → 53400; đầu vào sai → 23514. */
export async function registerMediaAsset(tx: Database, asset: MediaAssetRow): Promise<void> {
  await tx.execute(
    sql`SELECT cf.register_media_asset(${asset.id}::uuid, ${asset.kind}, ${asset.contentType}, ${asset.sizeBytes}::bigint)`,
  );
}

/** Đặt danh sách file của một bài (thay toàn bộ, giữ thứ tự). Owner; bài không sửa được 55000; file lạ/đã gắn bài khác/tập không hợp lệ 22023. */
export async function setPublishPostMedia(
  tx: Database,
  postId: string,
  mediaIds: readonly string[],
): Promise<void> {
  const ids =
    mediaIds.length === 0
      ? sql`'{}'::uuid[]`
      : sql`ARRAY[${sql.join(
          mediaIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]::uuid[]`;
  await tx.execute(sql`SELECT cf.set_publish_post_media(${postId}::uuid, ${ids})`);
}

/** Một file của workspace (để phục vụ xem trước); không thấy → `null`. RLS: chỉ Owner. */
export async function getMediaAsset(
  tx: Database,
  workspaceId: string,
  id: string,
): Promise<MediaAssetRow | null> {
  const r = await tx.execute<Row>(sql`
    SELECT id, kind, content_type, size_bytes FROM cf.media_assets
     WHERE workspace_id = ${workspaceId}::uuid AND id = ${id}::uuid`);
  const row = r.rows[0];
  return row ? asAsset(row) : null;
}

/** File đã gắn vào một bài, theo thứ tự (để điền lại khi sửa bài). */
export async function listPublishPostMedia(
  tx: Database,
  workspaceId: string,
  postId: string,
): Promise<MediaAssetRow[]> {
  const r = await tx.execute<Row>(sql`
    SELECT a.id, a.kind, a.content_type, a.size_bytes
      FROM cf.publish_post_media m
      JOIN cf.media_assets a ON a.workspace_id = m.workspace_id AND a.id = m.media_id
     WHERE m.workspace_id = ${workspaceId}::uuid AND m.post_id = ${postId}::uuid
     ORDER BY m.position`);
  return r.rows.map(asAsset);
}

/** WORKER (withJob): file của bài để tải từ kho và đăng. */
export async function listMediaForPublish(tx: Database, postId: string): Promise<MediaAssetRow[]> {
  const r = await tx.execute<Row>(
    sql`SELECT media_id AS id, kind, content_type, size_bytes FROM cf.list_publish_media(${postId}::uuid)`,
  );
  return r.rows.map(asAsset);
}

/** WORKER (withSystem — ngữ cảnh trần của cf_worker): xóa dòng file mồ côi, trả (workspace, id) để xóa file trong kho. */
export async function purgeOrphanMedia(
  tx: Database,
  limit: number,
): Promise<Array<{ workspaceId: string; id: string }>> {
  const r = await tx.execute<{ workspace_id: string; id: string }>(
    sql`SELECT workspace_id, id FROM cf.purge_orphan_media(${limit}::integer)`,
  );
  return r.rows.map((row) => ({ workspaceId: row.workspace_id, id: row.id }));
}
