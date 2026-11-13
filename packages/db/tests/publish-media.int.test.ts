import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  getMediaAsset,
  listMediaForPublish,
  listPublishPostMedia,
  purgeOrphanMedia,
  registerMediaAsset,
  setPublishPostMedia,
} from '../src/publish-media';
import { savePublishPost } from '../src/publish-posts';
import {
  createAdminPool,
  createAppDb,
  createWorkerDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * COMPOSER-MEDIA (migration 0092, Q-PUB4): Owner đăng ký file và đặt danh sách file của bài (tối đa 10 ảnh HOẶC 1 video, không trộn); Staff/workspace khác bị từ chối;
 * worker đọc danh sách file; dọn file mồ côi chỉ ở ngữ cảnh trần của cf_worker.
 */
const RLS = '42501';
const INVALID = '22023';
const NOT_EDITABLE = '55000';
const TOO_MANY = '53400';

let admin: pg.Pool;
let app: FlowDb;
let worker: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;

const asOwner = <T>(fn: (tx: Parameters<Parameters<FlowDb['withActor']>[2]>[0]) => Promise<T>) =>
  app.withActor(ws, owner, fn);
const png = (id = randomUUID()) => ({
  id,
  kind: 'image' as const,
  contentType: 'image/png',
  sizeBytes: 1000,
});
const mp4 = (id = randomUUID()) => ({
  id,
  kind: 'video' as const,
  contentType: 'video/mp4',
  sizeBytes: 5_000_000,
});
const draft = () =>
  asOwner((tx) => savePublishPost(tx, { message: 'bài có media', channelIds: [] }));
const register = async (asset: ReturnType<typeof png> | ReturnType<typeof mp4>) => {
  await asOwner((tx) => registerMediaAsset(tx, asset));
  return asset.id;
};

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  worker = createWorkerDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'media-owner');
  staff = await seedUser(admin, 'media-staff');
  otherOwner = await seedUser(admin, 'media-other');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});
afterAll(async () => {
  await app.close();
  await worker.close();
  await admin.end();
});

describe('đăng ký và đặt danh sách file', () => {
  it('Owner đăng ký file, đặt theo thứ tự, đọc lại đúng thứ tự; đặt lại thay toàn bộ', async () => {
    const post = await draft();
    const [a, b, c] = [await register(png()), await register(png()), await register(png())];
    await asOwner((tx) => setPublishPostMedia(tx, post, [c, a, b, c]));
    expect((await asOwner((tx) => listPublishPostMedia(tx, ws, post))).map((m) => m.id)).toEqual([
      c,
      a,
      b,
    ]);
    await asOwner((tx) => setPublishPostMedia(tx, post, [b]));
    expect((await asOwner((tx) => listPublishPostMedia(tx, ws, post))).map((m) => m.id)).toEqual([
      b,
    ]);
    expect(await asOwner((tx) => getMediaAsset(tx, ws, b))).toMatchObject({
      kind: 'image',
      contentType: 'image/png',
      sizeBytes: 1000,
    });
  });

  it('lưu bài qua savePublishPost đặt luôn danh sách file; không truyền = gỡ hết', async () => {
    const a = await register(png());
    const post = await asOwner((tx) =>
      savePublishPost(tx, { message: 'x', channelIds: [], mediaIds: [a] }),
    );
    expect((await asOwner((tx) => listPublishPostMedia(tx, ws, post))).map((m) => m.id)).toEqual([
      a,
    ]);
    await asOwner((tx) => savePublishPost(tx, { id: post, message: 'x', channelIds: [] }));
    expect(await asOwner((tx) => listPublishPostMedia(tx, ws, post))).toEqual([]);
  });

  it('trộn ảnh với video, quá 10 ảnh, 2 video → 22023', async () => {
    const post = await draft();
    const image = await register(png());
    const video = await register(mp4());
    const video2 = await register(mp4());
    const images = await Promise.all(Array.from({ length: 11 }, () => register(png())));
    for (const ids of [[image, video], [video, video2], images]) {
      expect(await expectRejectCode(asOwner((tx) => setPublishPostMedia(tx, post, ids)))).toBe(
        INVALID,
      );
    }
    await asOwner((tx) => setPublishPostMedia(tx, post, images.slice(0, 10)));
    await asOwner((tx) => setPublishPostMedia(tx, post, [video]));
  });

  it('file lạ, của workspace khác hoặc đã gắn vào bài khác → 22023', async () => {
    const [p1, p2] = [await draft(), await draft()];
    const mine = await register(png());
    await asOwner((tx) => setPublishPostMedia(tx, p1, [mine]));
    expect(await expectRejectCode(asOwner((tx) => setPublishPostMedia(tx, p2, [mine])))).toBe(
      INVALID,
    );
    expect(
      await expectRejectCode(asOwner((tx) => setPublishPostMedia(tx, p2, [randomUUID()]))),
    ).toBe(INVALID);
    const foreign = png();
    await app.withActor(other, otherOwner, (tx) => registerMediaAsset(tx, foreign));
    expect(await expectRejectCode(asOwner((tx) => setPublishPostMedia(tx, p2, [foreign.id])))).toBe(
      INVALID,
    );
  });

  it('bài đã đăng/không còn sửa được → 55000; bài của workspace khác → 55000', async () => {
    const post = await draft();
    await admin.query("UPDATE cf.publish_posts SET status = 'published' WHERE id = $1", [post]);
    expect(await expectRejectCode(asOwner((tx) => setPublishPostMedia(tx, post, [])))).toBe(
      NOT_EDITABLE,
    );
    const foreignPost = await app.withActor(other, otherOwner, (tx) =>
      savePublishPost(tx, { message: 'x', channelIds: [] }),
    );
    expect(await expectRejectCode(asOwner((tx) => setPublishPostMedia(tx, foreignPost, [])))).toBe(
      NOT_EDITABLE,
    );
  });

  it('dữ liệu sai bị DB chặn: loại lạ, ảnh > 8MB, video > 200MB, kích thước 0 (23514)', async () => {
    for (const bad of [
      { ...png(), contentType: 'image/gif' },
      { ...png(), sizeBytes: 8 * 1024 * 1024 + 1 },
      { ...mp4(), sizeBytes: 200 * 1024 * 1024 + 1 },
      { ...png(), sizeBytes: 0 },
    ]) {
      expect(await expectRejectCode(asOwner((tx) => registerMediaAsset(tx, bad)))).toBe('23514');
    }
  });

  it('quá 60 file chưa gắn bài → 53400', async () => {
    const w = await seedWorkspace(admin);
    const o = await seedUser(admin, `media-cap-${randomUUID()}`);
    await seedMember(admin, w, o, 'owner');
    for (let i = 0; i < 60; i++) {
      await app.withActor(w, o, (tx) => registerMediaAsset(tx, png()));
    }
    expect(await expectRejectCode(app.withActor(w, o, (tx) => registerMediaAsset(tx, png())))).toBe(
      TOO_MANY,
    );
  });
});

describe('quyền và cô lập', () => {
  it('Staff không đăng ký/đặt file được (42501) và không thấy file', async () => {
    const id = await register(png());
    expect(
      await expectRejectCode(app.withActor(ws, staff, (tx) => registerMediaAsset(tx, png()))),
    ).toBe(RLS);
    const post = await draft();
    expect(
      await expectRejectCode(app.withActor(ws, staff, (tx) => setPublishPostMedia(tx, post, []))),
    ).toBe(RLS);
    expect(await app.withActor(ws, staff, (tx) => getMediaAsset(tx, ws, id))).toBeNull();
  });

  it('workspace khác không thấy file của mình', async () => {
    const id = await register(png());
    expect(await app.withActor(other, otherOwner, (tx) => getMediaAsset(tx, other, id))).toBeNull();
  });
});

describe('worker', () => {
  it('worker (withJob) đọc danh sách file của bài theo thứ tự; Owner (web) KHÔNG gọi được hàm của worker', async () => {
    const post = await draft();
    const [a, b] = [await register(png()), await register(png())];
    await asOwner((tx) => setPublishPostMedia(tx, post, [b, a]));
    const files = await worker.withJob(ws, (tx) => listMediaForPublish(tx, post));
    expect(files.map((f) => f.id)).toEqual([b, a]);
    expect(await expectRejectCode(asOwner((tx) => listMediaForPublish(tx, post)))).toBe(RLS);
  });

  it('dọn mồ côi: chưa gắn bài quá 24 giờ, hoặc chỉ gắn bài kết thúc quá 7 ngày; giữ file còn dùng; chỉ ngữ cảnh trần cf_worker', async () => {
    const orphan = await register(png());
    const fresh = await register(png());
    const keep = await register(png());
    const done = await register(png());
    const keepPost = await draft();
    await asOwner((tx) => setPublishPostMedia(tx, keepPost, [keep]));
    const donePost = await draft();
    await asOwner((tx) => setPublishPostMedia(tx, donePost, [done]));
    await admin.query(
      "UPDATE cf.media_assets SET created_at = now() - interval '25 hours' WHERE id = ANY ($1)",
      [[orphan, keep]],
    );
    await admin.query(
      "UPDATE cf.publish_posts SET status = 'published', updated_at = now() - interval '8 days' WHERE id = $1",
      [donePost],
    );
    const purged = await worker.withSystem((tx) => purgeOrphanMedia(tx, 500));
    const ids = purged.map((p) => p.id);
    expect(ids).toContain(orphan);
    expect(ids).toContain(done);
    expect(ids).not.toContain(fresh);
    expect(ids).not.toContain(keep);
    expect(purged.find((p) => p.id === orphan)?.workspaceId).toBe(ws);
    expect(await expectRejectCode(app.withActor(ws, owner, (tx) => purgeOrphanMedia(tx, 10)))).toBe(
      RLS,
    );
    expect(await expectRejectCode(worker.withJob(ws, (tx) => purgeOrphanMedia(tx, 10)))).toBe(RLS);
  });

  it('xóa bài → liên kết file biến mất (file thành mồ côi để dọn)', async () => {
    const id = await register(png());
    const post = await asOwner((tx) =>
      savePublishPost(tx, { message: 'x', channelIds: [], mediaIds: [id] }),
    );
    await admin.query('DELETE FROM cf.publish_posts WHERE id = $1', [post]);
    const link = await admin.query('SELECT 1 FROM cf.publish_post_media WHERE media_id = $1', [id]);
    expect(link.rows).toHaveLength(0);
    const asset = await admin.query('SELECT 1 FROM cf.media_assets WHERE id = $1', [id]);
    expect(asset.rows).toHaveLength(1);
  });
});
