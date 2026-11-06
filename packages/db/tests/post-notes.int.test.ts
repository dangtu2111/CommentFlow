import { randomUUID } from 'node:crypto';
import { parsePostNoteInput, postNoteStatus } from '@flow/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createPostNote,
  deletePostNote,
  getPostAutoOverride,
  listActivePostNotes,
  listPostNotes,
  setPostAutoOverride,
  updatePostNote,
} from '../src/queries/post-notes';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode as rejectCodeOf,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * POST-NOTES (FR-062, US-033, Q-PN1): RLS chéo workspace, chỉ Owner ghi (Staff chỉ đọc), ràng buộc dữ liệu,
 * ghi chú hết hạn không được dùng, ghi đè chế độ tự động chỉ siết (off/shadow).
 */
const RLS = '42501';
const FK = '23503';
const CHECK = '23514';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;
let stranger: string;

const expectRejectCode = async (promise: Promise<unknown>, code: string) =>
  expect(await rejectCodeOf(promise)).toBe(code);

const note = (o: Record<string, unknown>) => {
  const r = parsePostNoteInput(o);
  expect(r.success).toBe(true);
  return (r as { data: Parameters<typeof createPostNote>[3] }).data;
};

async function seedPost(workspace: string): Promise<string> {
  const ch = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
    [workspace, `pn-${randomUUID()}`],
  );
  const r = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
    [workspace, ch.rows[0].id, `post-${randomUUID()}`],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  staff = await seedUser(admin, 'staff');
  otherOwner = await seedUser(admin, 'otherOwner');
  stranger = await seedUser(admin, 'stranger');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-062 / US-033 ghi chú theo bài', () => {
  it('Owner thêm/sửa/liệt kê/xóa; validFrom mặc định now(); sửa không đặt lại ngày bắt đầu', async () => {
    const post = await seedPost(ws);
    const id = await db.withActor(ws, owner, (tx) =>
      createPostNote(tx, ws, post, note({ content: 'Giá livestream 199k' })),
    );
    const [n] = await db.withActor(ws, owner, (tx) => listPostNotes(tx, ws, post));
    expect(n).toMatchObject({ id, postId: post, content: 'Giá livestream 199k', validTo: null });
    expect(Math.abs(Date.now() - (n?.validFrom.getTime() ?? 0))).toBeLessThan(60_000);

    expect(
      await db.withActor(ws, owner, (tx) =>
        updatePostNote(
          tx,
          ws,
          id,
          note({ content: 'Giá 189k', validTo: new Date(Date.now() + 3_600_000) }),
        ),
      ),
    ).toBe(true);
    const [after] = await db.withActor(ws, owner, (tx) => listPostNotes(tx, ws, post));
    expect(after?.content).toBe('Giá 189k');
    expect(after?.validFrom).toEqual(n?.validFrom);
    expect(after?.validTo).not.toBeNull();

    expect(await db.withActor(ws, owner, (tx) => deletePostNote(tx, ws, id))).toBe(true);
    expect(await db.withActor(ws, owner, (tx) => deletePostNote(tx, ws, id))).toBe(false);
  });

  it('chỉ trả ghi chú đang hiệu lực: chưa tới, hết hạn (đúng biên valid_to) bị loại; khớp postNoteStatus', async () => {
    const post = await seedPost(ws);
    const t0 = new Date('2026-11-06T10:00:00Z');
    const at = (h: number) => new Date(t0.getTime() + h * 3_600_000);
    await db.withActor(ws, owner, async (tx) => {
      await createPostNote(tx, ws, post, note({ content: 'sắp tới', validFrom: at(2) }));
      await createPostNote(
        tx,
        ws,
        post,
        note({ content: 'hết hạn', validFrom: at(-5), validTo: at(0) }),
      );
      await createPostNote(
        tx,
        ws,
        post,
        note({ content: 'đang chạy', validFrom: at(-1), validTo: at(1) }),
      );
      await createPostNote(tx, ws, post, note({ content: 'không hạn', validFrom: at(-9) }));
    });
    const names = async (when: Date) =>
      (await db.withActor(ws, staff, (tx) => listActivePostNotes(tx, ws, post, when)))
        .map((x) => x.content)
        .sort();
    expect(await names(t0)).toEqual(['không hạn', 'đang chạy']);
    expect(await names(at(1))).toEqual(['không hạn']);
    expect(await names(at(2))).toEqual(['không hạn', 'sắp tới']);

    const all = await db.withActor(ws, owner, (tx) => listPostNotes(tx, ws, post));
    for (const when of [t0, at(1), at(2)]) {
      const viaStatus = all
        .filter((x) => postNoteStatus(x, when) === 'active')
        .map((x) => x.content)
        .sort();
      expect(viaStatus).toEqual(await names(when));
    }
  });

  it('CHECK: nội dung rỗng/quá dài, hạn <= bắt đầu bị DB từ chối (23514) kể cả khi bỏ qua Zod', async () => {
    const post = await seedPost(ws);
    const bad = (o: Record<string, unknown>) =>
      db.withActor(ws, owner, (tx) =>
        createPostNote(tx, ws, post, { content: 'x', validFrom: null, validTo: null, ...o }),
      );
    await expectRejectCode(bad({ content: '' }), CHECK);
    await expectRejectCode(bad({ content: 'a'.repeat(1001) }), CHECK);
    const f = new Date('2026-11-06T10:00:00Z');
    await expectRejectCode(bad({ validFrom: f, validTo: f }), CHECK);
    // sửa chỉ một phía vẫn bị chặn: đẩy validTo của ghi chú không hạn về trước validFrom cũ
    const id = await db.withActor(ws, owner, (tx) =>
      createPostNote(tx, ws, post, { content: 'x', validFrom: f, validTo: null }),
    );
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        updatePostNote(tx, ws, id, {
          content: 'x',
          validFrom: null,
          validTo: new Date(f.getTime() - 1000),
        }),
      ),
      CHECK,
    );
  });

  it('Staff đọc được nhưng không thêm/sửa/xóa; người ngoài không đọc, không ghi; withWorkspace trần chỉ đọc', async () => {
    const post = await seedPost(ws);
    const id = await db.withActor(ws, owner, (tx) =>
      createPostNote(tx, ws, post, note({ content: 'riêng Owner ghi' })),
    );
    expect(await db.withActor(ws, staff, (tx) => listPostNotes(tx, ws, post))).toHaveLength(1);
    await expectRejectCode(
      db.withActor(ws, staff, (tx) => createPostNote(tx, ws, post, note({ content: 'staff' }))),
      RLS,
    );
    expect(await db.withActor(ws, staff, (tx) => deletePostNote(tx, ws, id))).toBe(false);
    expect(
      await db.withActor(ws, staff, (tx) => updatePostNote(tx, ws, id, note({ content: 'sửa' }))),
    ).toBe(false);
    expect(await db.withActor(ws, stranger, (tx) => listPostNotes(tx, ws, post))).toEqual([]);
    await expectRejectCode(
      db.withActor(ws, stranger, (tx) => createPostNote(tx, ws, post, note({ content: 'lạ' }))),
      RLS,
    );
    await expectRejectCode(
      db.withWorkspace(ws, (tx) => createPostNote(tx, ws, post, note({ content: 'trần' }))),
      RLS,
    );
    expect(await db.withWorkspace(ws, (tx) => listPostNotes(tx, ws, post))).toHaveLength(1);
    const [still] = await db.withActor(ws, owner, (tx) => listPostNotes(tx, ws, post));
    expect(still?.content).toBe('riêng Owner ghi');
  });

  it('hệ thống (withJob) ghi được', async () => {
    const post = await seedPost(ws);
    await db.withJob(ws, (tx) => createPostNote(tx, ws, post, note({ content: 'từ job' })));
    expect(await db.withJob(ws, (tx) => listPostNotes(tx, ws, post))).toHaveLength(1);
  });

  it('workspace khác không thấy/sửa/xóa, không ghi cho bài của workspace này (23503)', async () => {
    const post = await seedPost(ws);
    const id = await db.withActor(ws, owner, (tx) =>
      createPostNote(tx, ws, post, note({ content: 'của ws' })),
    );
    expect(await db.withActor(other, otherOwner, (tx) => listPostNotes(tx, other, post))).toEqual(
      [],
    );
    expect(await db.withActor(other, otherOwner, (tx) => deletePostNote(tx, other, id))).toBe(
      false,
    );
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) =>
        createPostNote(tx, other, post, note({ content: 'chéo' })),
      ),
      FK,
    );
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) =>
        createPostNote(tx, ws, post, note({ content: 'giả workspace' })),
      ),
      RLS,
    );
  });

  it('xóa bài thì xóa ghi chú và ghi đè (cascade)', async () => {
    const post = await seedPost(ws);
    await db.withActor(ws, owner, async (tx) => {
      await createPostNote(tx, ws, post, note({ content: 'sẽ mất' }));
      await setPostAutoOverride(tx, ws, post, 'off');
    });
    await admin.query('DELETE FROM cf.posts WHERE id = $1', [post]);
    const n = await admin.query('SELECT 1 FROM cf.post_notes WHERE post_id = $1', [post]);
    const o = await admin.query('SELECT 1 FROM cf.post_auto_overrides WHERE post_id = $1', [post]);
    expect(n.rowCount).toBe(0);
    expect(o.rowCount).toBe(0);
  });
});

describe('FR-062 ghi đè chế độ tự động theo bài', () => {
  it('đặt, đổi (upsert), bỏ ghi đè; không có dòng = null', async () => {
    const post = await seedPost(ws);
    expect(await db.withActor(ws, owner, (tx) => getPostAutoOverride(tx, ws, post))).toBeNull();
    await db.withActor(ws, owner, (tx) => setPostAutoOverride(tx, ws, post, 'shadow'));
    expect(await db.withActor(ws, staff, (tx) => getPostAutoOverride(tx, ws, post))).toBe('shadow');
    await db.withActor(ws, owner, (tx) => setPostAutoOverride(tx, ws, post, 'off'));
    expect(await db.withActor(ws, owner, (tx) => getPostAutoOverride(tx, ws, post))).toBe('off');
    await db.withActor(ws, owner, (tx) => setPostAutoOverride(tx, ws, post, null));
    expect(await db.withActor(ws, owner, (tx) => getPostAutoOverride(tx, ws, post))).toBeNull();
  });

  it("DB chặn 'auto' (chỉ siết) kể cả khi bỏ qua kiểu TypeScript", async () => {
    const post = await seedPost(ws);
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        setPostAutoOverride(tx, ws, post, 'auto' as unknown as 'off'),
      ),
      CHECK,
    );
  });

  it('Staff, người ngoài, withWorkspace trần không ghi được; workspace khác không thấy', async () => {
    const post = await seedPost(ws);
    await db.withActor(ws, owner, (tx) => setPostAutoOverride(tx, ws, post, 'off'));
    await expectRejectCode(
      db.withActor(ws, staff, (tx) => setPostAutoOverride(tx, ws, post, 'shadow')),
      RLS,
    );
    await expectRejectCode(
      db.withActor(ws, stranger, (tx) => setPostAutoOverride(tx, ws, post, 'shadow')),
      RLS,
    );
    await expectRejectCode(
      db.withWorkspace(ws, (tx) => setPostAutoOverride(tx, ws, post, 'shadow')),
      RLS,
    );
    // Staff gỡ ghi đè: DELETE bị RLS lọc im lặng, dòng vẫn còn
    await db.withActor(ws, staff, (tx) => setPostAutoOverride(tx, ws, post, null));
    expect(await db.withActor(ws, owner, (tx) => getPostAutoOverride(tx, ws, post))).toBe('off');
    expect(
      await db.withActor(other, otherOwner, (tx) => getPostAutoOverride(tx, other, post)),
    ).toBeNull();
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) => setPostAutoOverride(tx, other, post, 'off')),
      FK,
    );
  });
});
