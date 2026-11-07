import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { loadPipelineContext } from '../src/queries/pipeline-context';
import { createAdminPool, createAppDb, seedUser, seedWorkspace } from './helpers';

/**
 * PIPE-ORCHESTRATOR lát B: `loadPipelineContext` — CHỈ ĐỌC, mọi truy vấn lọc `workspace_id`. Trả bình luận + bài + sản phẩm gắn bài
 * (đã xác nhận) + tên Page + cấu hình + bản kiến thức đã xuất bản + ngữ cảnh chuỗi (`clarifyCount`, `repeatCount`, `humanHolding`).
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let staff: string;
let channel: string;
let post: string;

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);

async function addComment(over: {
  text?: string;
  author?: string;
  postId?: string;
  createdAt?: Date;
  repliedBy?: string | null;
  repliedAt?: Date | null;
  isOwn?: boolean;
  deletedAt?: Date | null;
  mergedInto?: string | null;
  source?: string;
  attachments?: unknown;
  workspace?: string;
  channelId?: string;
}): Promise<string> {
  const w = over.workspace ?? ws;
  const r = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, created_time,
        replied_by, replied_at, is_own, deleted_at, merged_into_id, ingest_source, attachments)
     VALUES ($1, $2, $3, $4, $5, 'Khách', $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb) RETURNING id`,
    [
      w,
      over.channelId ?? channel,
      over.postId ?? post,
      `cm-${randomUUID()}`,
      over.author ?? 'u1',
      over.text ?? 'Giá bao nhiêu?',
      over.createdAt ?? new Date(),
      over.repliedBy ?? null,
      over.repliedAt ?? null,
      over.isOwn ?? false,
      over.deletedAt ?? null,
      over.mergedInto ?? null,
      over.source ?? 'webhook',
      JSON.stringify(over.attachments ?? []),
    ],
  );
  return r.rows[0].id as string;
}

async function addDraft(commentId: string, action: string, status: string) {
  await admin.query(
    `INSERT INTO cf.drafts (workspace_id, target_type, target_id, text, lang, action, status)
     VALUES ($1, 'comment', $2, 'câu trả lời', 'vi', $3, $4)`,
    [ws, commentId, action, status],
  );
}

const load = (id: string, workspace = ws) =>
  db.withJob(workspace, (tx) => loadPipelineContext(tx, workspace, id, new Date()));

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  staff = await seedUser(admin, 'staff');
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Shop Demo') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  post = (
    await admin.query(
      "INSERT INTO cf.posts (workspace_id, channel_id, external_id, message, is_ad) VALUES ($1, $2, $3, 'Áo thun mùa hè sale', true) RETURNING id",
      [ws, channel, `post-${randomUUID()}`],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('loadPipelineContext — dữ liệu nền', () => {
  it('trả bình luận, bài (caption), tên Page, nguồn, loại đính kèm; cấu hình mặc định khi chưa có dòng; chưa có bản xuất bản → null', async () => {
    const id = await addComment({
      text: 'Mẫu này giá sao?',
      source: 'polling',
      attachments: [{ type: 'photo', url: 'https://x/y.jpg' }, { type: 'sticker' }],
    });
    const ctx = await load(id);
    expect(ctx).not.toBeNull();
    expect(ctx?.comment).toMatchObject({
      id,
      channelId: channel,
      postId: post,
      authorExternalId: 'u1',
      text: 'Mẫu này giá sao?',
      status: 'new',
      isOwn: false,
      deleted: false,
      mergedIntoId: null,
      ingestSource: 'polling',
      attachmentTypes: ['photo', 'sticker'],
    });
    expect(ctx?.post).toEqual({ id: post, caption: 'Áo thun mùa hè sale', isAd: true });
    expect(ctx?.pageNames).toEqual(['Shop Demo']);
    expect(ctx?.settings).toEqual({
      mergeWindowSeconds: 30,
      humanHoldMinutes: 120,
      maxAiRepliesPerCustomerPost: 3,
    });
    expect(ctx?.kbVersion).toBeNull();
    expect(ctx?.postProductIds).toEqual([]);
  });

  it('cấu hình thật của workspace được dùng; bản kiến thức mới nhất ĐÃ xuất bản', async () => {
    await admin.query(
      'INSERT INTO cf.automation_settings (workspace_id, merge_window_seconds, human_hold_minutes) VALUES ($1, 45, 0)',
      [ws],
    );
    await admin.query('INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1), ($1, 3)', [
      ws,
    ]);
    const ctx = await load(await addComment({}));
    expect(ctx?.settings).toEqual({
      mergeWindowSeconds: 45,
      humanHoldMinutes: 0,
      maxAiRepliesPerCustomerPost: 3,
    });
    expect(ctx?.kbVersion?.number).toBe(3);
    await admin.query('DELETE FROM cf.automation_settings WHERE workspace_id = $1', [ws]);
    await admin.query('DELETE FROM cf.kb_versions WHERE workspace_id = $1', [ws]);
  });

  it('chỉ sản phẩm gắn bài ĐÃ XÁC NHẬN (gợi ý của AI chưa xác nhận thì không tính), chính trước', async () => {
    const mk = async (name: string) =>
      (
        await admin.query(
          'INSERT INTO cf.products (workspace_id, name, search_text) VALUES ($1, $2, $2) RETURNING id',
          [ws, name],
        )
      ).rows[0].id as string;
    const [a, b, c] = [await mk('SP a'), await mk('SP b'), await mk('SP c')];
    const p2 = (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [ws, channel, `post-${randomUUID()}`],
      )
    ).rows[0].id as string;
    await admin.query(
      `INSERT INTO cf.post_products (workspace_id, post_id, product_id, status, is_primary, suggested_by_ai) VALUES
         ($1, $2, $3, 'confirmed', false, false), ($1, $2, $4, 'confirmed', true, false), ($1, $2, $5, 'suggested', false, true)`,
      [ws, p2, a, b, c],
    );
    const ctx = await load(await addComment({ postId: p2 }));
    expect(ctx?.postProductIds).toEqual([b, a]);
  });

  it('bình luận của Page, đã xóa, đã gộp: vẫn trả về kèm cờ để nơi gọi quyết định (không tự bỏ qua ngầm)', async () => {
    const target = await addComment({});
    const own = await load(await addComment({ isOwn: true }));
    const deleted = await load(await addComment({ deletedAt: new Date() }));
    const merged = await load(await addComment({ mergedInto: target }));
    expect(own?.comment.isOwn).toBe(true);
    expect(deleted?.comment.deleted).toBe(true);
    expect(merged?.comment.mergedIntoId).toBe(target);
  });

  it('không có bình luận / thuộc workspace khác → null (không lộ chéo workspace)', async () => {
    expect(await load(randomUUID())).toBeNull();
    const foreignChannel = (
      await admin.query(
        "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'X') RETURNING id",
        [other, `p-${randomUUID()}`],
      )
    ).rows[0].id as string;
    const foreignPost = (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [other, foreignChannel, `post-${randomUUID()}`],
      )
    ).rows[0].id as string;
    const foreign = await addComment({
      workspace: other,
      channelId: foreignChannel,
      postId: foreignPost,
    });
    expect(await load(foreign, ws)).toBeNull();
    expect(await load(foreign, other)).not.toBeNull();
  });
});

describe('loadPipelineContext — ngữ cảnh chuỗi (cùng khách, cùng bài)', () => {
  it('humanHolding: nhân viên đã trả lời trong khung giữ → true; quá khung hoặc khung = 0 → false', async () => {
    const author = `holder-${randomUUID()}`;
    await addComment({
      author,
      createdAt: ago(30 * MIN),
      repliedBy: staff,
      repliedAt: ago(10 * MIN),
    });
    const current = await addComment({ author });
    expect((await load(current))?.thread.humanHolding).toBe(true);

    const old = `old-${randomUUID()}`;
    await addComment({
      author: old,
      createdAt: ago(600 * MIN),
      repliedBy: staff,
      repliedAt: ago(500 * MIN),
    });
    expect((await load(await addComment({ author: old })))?.thread.humanHolding).toBe(false);

    await admin.query(
      'INSERT INTO cf.automation_settings (workspace_id, human_hold_minutes) VALUES ($1, 0)',
      [ws],
    );
    expect((await load(current))?.thread.humanHolding).toBe(false);
    await admin.query('DELETE FROM cf.automation_settings WHERE workspace_id = $1', [ws]);
  });

  it('clarifyCount: chỉ đếm câu hỏi lại ĐÃ gửi cho khách (sent_as_is/edited/auto_sent) trên các lượt trước', async () => {
    const author = `clr-${randomUUID()}`;
    const first = await addComment({ author, createdAt: ago(20 * MIN) });
    const second = await addComment({ author, createdAt: ago(10 * MIN) });
    await addDraft(first, 'clarify', 'sent_as_is');
    await addDraft(first, 'clarify', 'suggested'); // chưa gửi → không tính
    await addDraft(first, 'clarify', 'discarded'); // bỏ → không tính
    await addDraft(first, 'answer', 'sent_as_is'); // không phải hỏi lại → không tính
    await addDraft(second, 'clarify', 'edited');
    const current = await addComment({ author });
    expect((await load(current))?.thread.clarifyCount).toBe(2);
    // Lượt trước chưa có gì → 0 cho khách khác.
    expect(
      (await load(await addComment({ author: `other-${randomUUID()}` })))?.thread.clarifyCount,
    ).toBe(0);
  });

  it('repeatCount: số lượt TRƯỚC cùng khách cùng bài có cùng nội dung (bỏ khác hoa/thường, khoảng trắng); không tính khách/bài khác, lượt sau, lượt đã gộp vào chính nó', async () => {
    const author = `rep-${randomUUID()}`;
    await addComment({ author, text: 'Giá  bao nhiêu shop?', createdAt: ago(30 * MIN) });
    await addComment({ author, text: 'giá bao nhiêu SHOP?', createdAt: ago(20 * MIN) });
    await addComment({ author, text: 'Còn hàng không?', createdAt: ago(15 * MIN) });
    await addComment({
      author: `x-${randomUUID()}`,
      text: 'Giá bao nhiêu shop?',
      createdAt: ago(25 * MIN),
    });
    const current = await addComment({
      author,
      text: 'Giá bao nhiêu shop?',
      createdAt: ago(5 * MIN),
    });
    await addComment({
      author,
      text: 'Giá bao nhiêu shop?',
      createdAt: new Date(Date.now() + MIN),
    }); // lượt sau
    await addComment({
      author,
      text: 'Giá bao nhiêu shop?',
      createdAt: ago(4 * MIN),
      mergedInto: current,
    });
    expect((await load(current))?.thread.repeatCount).toBe(2);
  });

  it('bình luận của Page và bình luận đã xóa trong chuỗi không tính vào ngữ cảnh', async () => {
    const author = `skip-${randomUUID()}`;
    await addComment({ author, text: 'Giá bao nhiêu?', createdAt: ago(20 * MIN), isOwn: true });
    await addComment({
      author,
      text: 'Giá bao nhiêu?',
      createdAt: ago(15 * MIN),
      deletedAt: new Date(),
    });
    const current = await addComment({ author, text: 'Giá bao nhiêu?' });
    expect((await load(current))?.thread).toEqual({
      clarifyCount: 0,
      repeatCount: 0,
      humanHolding: false,
    });
  });
});
