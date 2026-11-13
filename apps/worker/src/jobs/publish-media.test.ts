import { Readable } from 'node:stream';
import type { MediaAssetRow } from '@flow/db';
import type { MediaStore } from '@flow/storage';
import { describe, expect, it, vi } from 'vitest';
import { createMediaLoader, MediaUnavailableError, runMediaGc } from './publish-media';

const asset = (over: Partial<MediaAssetRow> = {}): MediaAssetRow => ({
  id: 'a1',
  kind: 'image',
  contentType: 'image/png',
  sizeBytes: 3,
  ...over,
});
const storeWith = (objects: Record<string, Buffer>): MediaStore => ({
  put: vi.fn(),
  remove: vi.fn(async () => {}),
  get: async (key) => {
    const bytes = objects[key];
    return bytes ? { body: Readable.from([bytes]), length: bytes.length, contentType: 'x' } : null;
  },
});
const quiet = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('createMediaLoader', () => {
  it('bài không có file → undefined (không cần kho)', async () => {
    const load = createMediaLoader({ list: async () => [], store: undefined });
    expect(await load('w1', 'p1')).toBeUndefined();
  });

  it('ảnh: tải theo thứ tự, khóa kho bắt đầu bằng workspace_id, tên file theo loại', async () => {
    const load = createMediaLoader({
      list: async () => [asset({ id: 'a1' }), asset({ id: 'a2', contentType: 'image/jpeg' })],
      store: storeWith({ 'w1/a1': Buffer.from('abc'), 'w1/a2': Buffer.from('def') }),
    });
    const media = await load('w1', 'p1');
    expect(media).toMatchObject({ kind: 'image' });
    const files = (media as { files: Array<{ filename: string; contentType: string }> }).files;
    expect(files.map((f) => f.filename)).toEqual(['a1.png', 'a2.jpg']);
  });

  it('video: một file', async () => {
    const load = createMediaLoader({
      list: async () => [
        asset({ id: 'v1', kind: 'video', contentType: 'video/mp4', sizeBytes: 3 }),
      ],
      store: storeWith({ 'w1/v1': Buffer.from('abc') }),
    });
    expect(await load('w1', 'p1')).toMatchObject({ kind: 'video', file: { filename: 'v1.mp4' } });
  });

  it('thiếu kho / file mất / sai kích thước → MediaUnavailableError (chắc chắn chưa đăng)', async () => {
    const noStore = createMediaLoader({ list: async () => [asset()], store: undefined });
    await expect(noStore('w1', 'p1')).rejects.toBeInstanceOf(MediaUnavailableError);
    const missing = createMediaLoader({ list: async () => [asset()], store: storeWith({}) });
    await expect(missing('w1', 'p1')).rejects.toBeInstanceOf(MediaUnavailableError);
    const mismatch = createMediaLoader({
      list: async () => [asset({ sizeBytes: 99 })],
      store: storeWith({ 'w1/a1': Buffer.from('abc') }),
    });
    await expect(mismatch('w1', 'p1')).rejects.toBeInstanceOf(MediaUnavailableError);
  });
});

describe('runMediaGc', () => {
  it('xóa file trong kho theo khóa workspace/id; lỗi xóa một file không dừng việc dọn; lỗi DB không ném', async () => {
    const remove = vi.fn(async (key: string) => {
      if (key === 'w1/bad') throw new Error('s3');
    });
    const store = { ...storeWith({}), remove };
    const purged = await runMediaGc({
      purge: async () => [
        { workspaceId: 'w1', id: 'bad' },
        { workspaceId: 'w2', id: 'ok' },
      ],
      store,
      logger: quiet,
    });
    expect(purged).toBe(2);
    expect(remove).toHaveBeenCalledWith('w1/bad');
    expect(remove).toHaveBeenCalledWith('w2/ok');
    expect(
      await runMediaGc({
        purge: async () => {
          throw new Error('db');
        },
        store,
        logger: quiet,
      }),
    ).toBe(0);
  });
});
