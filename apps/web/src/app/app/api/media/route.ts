import { randomUUID } from 'node:crypto';
import { registerMediaAsset } from '@flow/db/runtime';
import { maxBytesFor, mediaKey } from '@flow/storage';
import { isSameOrigin, parseContentLength, sniffAndStream } from '../../../../lib/media-upload';
import { actionAllowed } from '../../../../server/action-guard';
import { getDb } from '../../../../server/db';
import { mediaStore } from '../../../../server/media-runtime';
import { requireAppUser } from '../../../../server/require-app-user';

/**
 * Tải ảnh/video lên để đính vào bài đăng (COMPOSER-MEDIA, Q-PUB4). CHỈ Owner; cùng nguồn (chặn CSRF); thân yêu cầu là BYTE của file (không multipart) và phải có `Content-Length`.
 * Loại file nhận biết bằng NỘI DUNG (JPEG/PNG/WebP/MP4/MOV), KHÔNG tin `Content-Type`/đuôi file; ảnh ≤ 8MB, video ≤ 200MB. Chuyển tiếp thẳng lên kho S3 theo luồng (không đọc cả file vào bộ nhớ),
 * khóa `workspace_id/id`; chỉ khi kho nhận xong mới ghi DB. Lỗi trả MÃ ngắn, không kèm chi tiết nội bộ.
 */
export const dynamic = 'force-dynamic';

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request.headers)) return json(403, { error: 'forbidden' });
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  if (!(await actionAllowed('uiWrite', { userId: user.id, workspaceId: workspace.id }))) {
    return json(429, { error: 'rate_limited' });
  }
  const store = mediaStore();
  if (!store.ok) return json(503, { error: 'not_configured' });
  const length = parseContentLength(request.headers.get('content-length'));
  if (length === null || !request.body) return json(411, { error: 'length_required' });

  const sniffed = await sniffAndStream(request.body, length);
  if (!sniffed.ok) return json(415, { error: sniffed.reason });
  const { media, stream } = sniffed;
  if (length > maxBytesFor(media.kind)) {
    stream.destroy();
    return json(413, { error: 'too_large' });
  }

  const id = randomUUID();
  const key = mediaKey(workspace.id, id);
  try {
    await store.store.put(key, stream, length, media.contentType);
  } catch {
    await store.store.remove(key).catch(() => undefined);
    return json(502, { error: 'storage_failed' });
  }
  try {
    await getDb().withActor(workspace.id, user.id, (tx) =>
      registerMediaAsset(tx, {
        id,
        kind: media.kind,
        contentType: media.contentType,
        sizeBytes: length,
      }),
    );
  } catch (error) {
    await store.store.remove(key).catch(() => undefined);
    const code = (error as { cause?: { code?: string }; code?: string }).cause?.code;
    return code === '53400' || (error as { code?: string }).code === '53400'
      ? json(429, { error: 'too_many_unattached' })
      : json(500, { error: 'unavailable' });
  }
  return json(201, { id, kind: media.kind, contentType: media.contentType, sizeBytes: length });
}
