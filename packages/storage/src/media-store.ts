import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Kho lưu file ảnh/video của bài đăng (COMPOSER-MEDIA, Q-PUB4) qua S3 tương thích (SeaweedFS trên máy ảo). KHÔNG có bản giả khi chạy: thiếu cấu hình → `createMediaStoreFromEnv` trả
 * `{ ok: false, missing }` và tính năng tắt kèm lý do. Khóa file luôn bắt đầu bằng `workspace_id/` (cô lập theo workspace). Bản giả của test tự cắm qua `client`.
 */
export interface MediaStore {
  put(key: string, body: Readable, length: number, contentType: string): Promise<void>;
  /** Không có file → `null`. */
  get(key: string): Promise<{ body: Readable; length: number; contentType: string } | null>;
  remove(key: string): Promise<void>;
}

type S3Like = { send(command: unknown): Promise<unknown> };

export const mediaKey = (workspaceId: string, assetId: string): string =>
  `${workspaceId}/${assetId}`;

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  ((error as { name?: string }).name === 'NoSuchKey' ||
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);

export function createS3MediaStore(options: { client: S3Like; bucket: string }): MediaStore {
  const { client, bucket } = options;
  return {
    async put(key, body, length, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentLength: length,
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      try {
        const out = (await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))) as {
          Body?: Readable;
          ContentLength?: number;
          ContentType?: string;
        };
        if (!out.Body) return null;
        return {
          body: out.Body,
          length: out.ContentLength ?? 0,
          contentType: out.ContentType ?? 'application/octet-stream',
        };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

const REQUIRED = [
  'MEDIA_S3_ENDPOINT',
  'MEDIA_S3_BUCKET',
  'MEDIA_S3_ACCESS_KEY',
  'MEDIA_S3_SECRET_KEY',
] as const;

export type MediaStoreResult = { ok: true; store: MediaStore } | { ok: false; missing: string[] };

/** Dựng kho thật từ biến môi trường (`MEDIA_S3_*`). Thiếu biến nào → báo TÊN biến thiếu (không bịa mặc định cho khóa/địa chỉ). */
export function createMediaStoreFromEnv(env: Record<string, string | undefined>): MediaStoreResult {
  const value = (name: string) => env[name]?.trim() ?? '';
  const missing = REQUIRED.filter((name) => value(name) === '');
  if (missing.length > 0) return { ok: false, missing: [...missing] };
  const client = new S3Client({
    endpoint: value('MEDIA_S3_ENDPOINT'),
    region: value('MEDIA_S3_REGION') || 'auto',
    forcePathStyle: true,
    credentials: {
      accessKeyId: value('MEDIA_S3_ACCESS_KEY'),
      secretAccessKey: value('MEDIA_S3_SECRET_KEY'),
    },
  });
  return { ok: true, store: createS3MediaStore({ client, bucket: value('MEDIA_S3_BUCKET') }) };
}
