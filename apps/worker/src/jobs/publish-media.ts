import type { Readable } from 'node:stream';
import type { PostMedia } from '@flow/connectors';
import type { MediaAssetRow } from '@flow/db';
import { type MediaStore, maxBytesFor, mediaKey } from '@flow/storage';
import type { Logger } from '../logger';

/**
 * Tải ảnh/video của một bài từ kho để đăng (COMPOSER-MEDIA, Q-PUB4). Lỗi ở đây xảy ra TRƯỚC khi gọi Facebook nên chắc chắn CHƯA đăng → mục tiêu `failed` kèm mã `media_unavailable`
 * (không phải `unknown`). Thiếu kho cấu hình mà bài có file → cũng `media_unavailable` (không có đường vòng/bản giả).
 */
export class MediaUnavailableError extends Error {
  constructor(reason: 'no_store' | 'missing' | 'size_mismatch') {
    super(`media_unavailable:${reason}`);
    this.name = 'MediaUnavailableError';
  }
}

async function readAll(body: Readable, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > limit) throw new MediaUnavailableError('size_mismatch');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

export type MediaLoaderDeps = {
  list: (workspaceId: string, postId: string) => Promise<MediaAssetRow[]>;
  /** `undefined` = chưa cấu hình kho (`MEDIA_S3_*`). */
  store: MediaStore | undefined;
};

/** Trả `undefined` nếu bài không có file; ngược lại tải đủ file theo thứ tự (hoặc ném `MediaUnavailableError`). */
export function createMediaLoader(deps: MediaLoaderDeps) {
  return async function loadMedia(
    workspaceId: string,
    postId: string,
  ): Promise<PostMedia | undefined> {
    const assets = await deps.list(workspaceId, postId);
    if (assets.length === 0) return undefined;
    const { store } = deps;
    if (!store) throw new MediaUnavailableError('no_store');
    const files = [];
    for (const asset of assets) {
      const object = await store.get(mediaKey(workspaceId, asset.id));
      if (!object) throw new MediaUnavailableError('missing');
      const bytes = await readAll(object.body, maxBytesFor(asset.kind));
      if (bytes.length !== asset.sizeBytes) throw new MediaUnavailableError('size_mismatch');
      files.push({
        bytes,
        contentType: asset.contentType,
        filename: `${asset.id}.${EXTENSION[asset.contentType] ?? 'bin'}`,
      });
    }
    const first = assets[0];
    if (first?.kind === 'video') {
      return { kind: 'video', file: files[0] as (typeof files)[number] };
    }
    return { kind: 'image', files };
  };
}

export const MEDIA_GC_INTERVAL_MS = 60 * 60_000;
export const MEDIA_GC_BATCH = 100;

export type MediaGcDeps = {
  purge: (limit: number) => Promise<Array<{ workspaceId: string; id: string }>>;
  store: MediaStore;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
};

/** Dọn file mồ côi: xóa dòng DB rồi xóa file trong kho. Xóa file lỗi chỉ ghi log (file thừa không gây hại, không đăng lại). Không bao giờ ném. */
export async function runMediaGc(deps: MediaGcDeps): Promise<number> {
  let purged: Array<{ workspaceId: string; id: string }>;
  try {
    purged = await deps.purge(MEDIA_GC_BATCH);
  } catch (error) {
    deps.logger.error(
      { error: error instanceof Error ? error.name : 'unknown' },
      'media-gc: không dọn được dòng file mồ côi',
    );
    return 0;
  }
  let failed = 0;
  for (const item of purged) {
    try {
      await deps.store.remove(mediaKey(item.workspaceId, item.id));
    } catch {
      failed += 1;
    }
  }
  if (purged.length > 0) deps.logger.info({ purged: purged.length, failed }, 'media-gc xong');
  return purged.length;
}

export function startMediaGc(deps: MediaGcDeps): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    runMediaGc(deps).finally(() => {
      running = false;
    });
  };
  const timer = setInterval(tick, MEDIA_GC_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
