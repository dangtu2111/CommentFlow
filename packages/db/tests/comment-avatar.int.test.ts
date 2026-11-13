import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { setCommentAuthorAvatar } from '../src/comment-avatar';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * COMMENT-AUTHOR-AVATAR (migration 0089): ghi ảnh đại diện CHỈ qua hàm DEFINER hệ thống (worker `withJob`); web không ghi được; chỉ điền
 * khi bình luận của workspace hiện tại chưa xóa/không phải của Page/chưa có ảnh; URL phải https; bình luận bị xóa (kể cả dấu xóa đến
 * trước) thì URL bị xóa trắng.
 */
const RLS = '42501';
const INVALID = '22023';
const URL_OK = 'https://scontent.xx.fbcdn.net/v/avatar.jpg?oh=abc&oe=1';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let channel: string;
let post: string;

async function comment(extra: { isOwn?: boolean; ext?: string } = {}): Promise<string> {
  const r = await admin.query(
    `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, is_own)
     VALUES ('webhook', $1, $2, $3, $4, 'u1', 'Khách', 'nội dung', $5) RETURNING id`,
    [ws, channel, post, extra.ext ?? `cm-${randomUUID()}`, extra.isOwn ?? false],
  );
  return r.rows[0].id as string;
}
const avatarOf = async (id: string) =>
  (await admin.query('SELECT author_avatar_url AS a FROM cf.comments WHERE id = $1', [id])).rows[0]
    .a as string | null;
const asSystem = <T>(fn: (tx: Parameters<Parameters<FlowDb['withJob']>[1]>[0]) => Promise<T>) =>
  db.withJob(ws, fn);

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'avatar-owner');
  await seedMember(admin, ws, owner, 'owner');
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  post = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
      [ws, channel, `post-${randomUUID()}`],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('quyền ghi', () => {
  it('hệ thống (worker) ghi được; trả true; lưu đúng URL', async () => {
    const id = await comment();
    expect(await asSystem((tx) => setCommentAuthorAvatar(tx, id, URL_OK))).toBe(true);
    expect(await avatarOf(id)).toBe(URL_OK);
  });

  it('web (Owner, withActor) KHÔNG gọi được hàm và KHÔNG UPDATE trực tiếp cột', async () => {
    const id = await comment();
    expect(
      await expectRejectCode(
        db.withActor(ws, owner, (tx) => setCommentAuthorAvatar(tx, id, URL_OK)),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        db.withActor(ws, owner, (tx) =>
          tx.execute(
            sql`UPDATE cf.comments SET author_avatar_url = ${URL_OK} WHERE id = ${id}::uuid`,
          ),
        ),
      ),
    ).toBe(RLS);
    expect(await avatarOf(id)).toBeNull();
  });

  it('URL không phải https / có khoảng trắng / quá dài bị từ chối (22023); CHECK cột chặn cả đường chủ bảng', async () => {
    const id = await comment();
    for (const bad of [
      'http://x.test/a.jpg',
      'javascript:alert(1)',
      'https://x.test/a b.jpg',
      `https://x.test/${'a'.repeat(2100)}`,
      '',
    ]) {
      expect(
        await expectRejectCode(asSystem((tx) => setCommentAuthorAvatar(tx, id, bad))),
        bad.slice(0, 30),
      ).toBe(INVALID);
    }
    await expect(
      admin.query('UPDATE cf.comments SET author_avatar_url = $1 WHERE id = $2', [
        'http://x.test/a',
        id,
      ]),
    ).rejects.toThrow();
  });
});

describe('khi nào KHÔNG ghi (false)', () => {
  it('đã có ảnh → không ghi đè; bình luận của Page → không ghi; workspace khác → không ghi', async () => {
    const has = await comment();
    await asSystem((tx) => setCommentAuthorAvatar(tx, has, URL_OK));
    expect(await asSystem((tx) => setCommentAuthorAvatar(tx, has, 'https://x.test/khac.jpg'))).toBe(
      false,
    );
    expect(await avatarOf(has)).toBe(URL_OK);

    const own = await comment({ isOwn: true });
    expect(await asSystem((tx) => setCommentAuthorAvatar(tx, own, URL_OK))).toBe(false);
    expect(await avatarOf(own)).toBeNull();

    const mine = await comment();
    expect(await db.withJob(other, (tx) => setCommentAuthorAvatar(tx, mine, URL_OK))).toBe(false);
    expect(await avatarOf(mine)).toBeNull();
  });
});

describe('quyền riêng tư: bình luận bị xóa thì xóa URL ảnh', () => {
  it('đặt deleted_at → URL ảnh bị xóa trắng; bình luận đã xóa không nhận ảnh mới', async () => {
    const id = await comment();
    await asSystem((tx) => setCommentAuthorAvatar(tx, id, URL_OK));
    await admin.query('UPDATE cf.comments SET deleted_at = now() WHERE id = $1', [id]);
    expect(await avatarOf(id)).toBeNull();
    expect(await asSystem((tx) => setCommentAuthorAvatar(tx, id, URL_OK))).toBe(false);
  });

  it('dấu xóa đến TRƯỚC: dòng sinh ra đã xóa trắng, kể cả khi chèn kèm URL ảnh', async () => {
    const ext = `cm-${randomUUID()}`;
    await admin.query(
      'INSERT INTO cf.comment_tombstones (workspace_id, channel_id, external_id, deleted_at) VALUES ($1, $2, $3, now())',
      [ws, channel, ext],
    );
    const r = await admin.query(
      `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, text, author_avatar_url)
       VALUES ('webhook', $1, $2, $3, $4, 'u1', 'x', $5) RETURNING id, deleted_at`,
      [ws, channel, post, ext, URL_OK],
    );
    expect(r.rows[0].deleted_at).not.toBeNull();
    expect(await avatarOf(r.rows[0].id)).toBeNull();
  });
});
