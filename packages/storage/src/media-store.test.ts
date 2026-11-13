import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createMediaStoreFromEnv, createS3MediaStore, mediaKey } from './media-store';

const commandOf = (call: unknown[]) =>
  call[0] as { constructor: { name: string }; input: Record<string, unknown> };

describe('createS3MediaStore', () => {
  it('put gửi đúng bucket/khóa/độ dài/loại; remove xóa đúng khóa', async () => {
    const send = vi.fn(async () => ({}));
    const store = createS3MediaStore({ client: { send }, bucket: 'media' });
    await store.put('w/a', Readable.from([Buffer.from('x')]), 1, 'image/png');
    await store.remove('w/a');
    const put = commandOf(send.mock.calls[0] as unknown[]);
    expect(put.constructor.name).toBe('PutObjectCommand');
    expect(put.input).toMatchObject({
      Bucket: 'media',
      Key: 'w/a',
      ContentLength: 1,
      ContentType: 'image/png',
    });
    expect(commandOf(send.mock.calls[1] as unknown[]).constructor.name).toBe('DeleteObjectCommand');
  });

  it('get trả thân + độ dài + loại; không có file (NoSuchKey/404) → null; lỗi khác ném tiếp', async () => {
    const body = Readable.from([Buffer.from('abc')]);
    const ok = createS3MediaStore({
      client: { send: async () => ({ Body: body, ContentLength: 3, ContentType: 'image/png' }) },
      bucket: 'm',
    });
    expect(await ok.get('k')).toEqual({ body, length: 3, contentType: 'image/png' });

    const noBody = createS3MediaStore({ client: { send: async () => ({}) }, bucket: 'm' });
    expect(await noBody.get('k')).toBeNull();

    for (const error of [
      Object.assign(new Error('x'), { name: 'NoSuchKey' }),
      Object.assign(new Error('x'), { $metadata: { httpStatusCode: 404 } }),
    ]) {
      const missing = createS3MediaStore({
        client: {
          send: async () => {
            throw error;
          },
        },
        bucket: 'm',
      });
      expect(await missing.get('k')).toBeNull();
    }
    const broken = createS3MediaStore({
      client: {
        send: async () => {
          throw new Error('mạng');
        },
      },
      bucket: 'm',
    });
    await expect(broken.get('k')).rejects.toThrow('mạng');
  });
});

describe('createMediaStoreFromEnv và khóa file', () => {
  it('thiếu biến → báo ĐÚNG tên biến thiếu, không bản giả', () => {
    expect(createMediaStoreFromEnv({})).toEqual({
      ok: false,
      missing: [
        'MEDIA_S3_ENDPOINT',
        'MEDIA_S3_BUCKET',
        'MEDIA_S3_ACCESS_KEY',
        'MEDIA_S3_SECRET_KEY',
      ],
    });
    expect(
      createMediaStoreFromEnv({
        MEDIA_S3_ENDPOINT: 'http://x',
        MEDIA_S3_BUCKET: 'b',
        MEDIA_S3_ACCESS_KEY: ' ',
      }),
    ).toMatchObject({ ok: false, missing: ['MEDIA_S3_ACCESS_KEY', 'MEDIA_S3_SECRET_KEY'] });
  });

  it('đủ biến → có kho; khóa file bắt đầu bằng workspace_id', () => {
    const r = createMediaStoreFromEnv({
      MEDIA_S3_ENDPOINT: 'http://localhost:8333',
      MEDIA_S3_BUCKET: 'media',
      MEDIA_S3_ACCESS_KEY: 'a',
      MEDIA_S3_SECRET_KEY: 'b',
    });
    expect(r.ok).toBe(true);
    expect(mediaKey('ws1', 'asset1')).toBe('ws1/asset1');
  });
});
