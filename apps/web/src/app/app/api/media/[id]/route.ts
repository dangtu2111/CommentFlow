import { Readable } from 'node:stream';
import { getMediaAsset } from '@flow/db/runtime';
import { mediaKey } from '@flow/storage';
import { getDb } from '../../../../../server/db';
import { mediaStore } from '../../../../../server/media-runtime';
import { requireAppUser } from '../../../../../server/require-app-user';

/**
 * Xem trước một ảnh/video đã tải lên (COMPOSER-MEDIA). CHỈ Owner của workspace sở hữu file (RLS + khóa kho có workspace_id). Loại nội dung lấy từ DB (danh sách cố định do web kiểm
 * bằng nội dung lúc tải lên), không từ client; `nosniff`, chỉ cache riêng tư.
 */
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new Response(null, { status: 404 });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const { id } = await context.params;
  if (!UUID.test(id)) return notFound();
  const store = mediaStore();
  if (!store.ok) return new Response(null, { status: 503 });
  const asset = await getDb().withActor(workspace.id, user.id, (tx) =>
    getMediaAsset(tx, workspace.id, id),
  );
  if (!asset) return notFound();
  const object = await store.store.get(mediaKey(workspace.id, asset.id));
  if (!object) return notFound();
  return new Response(Readable.toWeb(object.body) as ReadableStream, {
    headers: {
      'Content-Type': asset.contentType,
      'Content-Length': String(asset.sizeBytes),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
