import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { loadPipelineContext } from '../src/queries/pipeline-context';
import { countRepliesForCommentThread } from '../src/queries/pipeline-convo';
import { createAdminPool, createAppDb, seedWorkspace } from './helpers';

/**
 * PIPE-CONVO-CONTEXT (Q-POR12) + FR-167 (Q-POR14): ngữ cảnh hội thoại ĐÃ che PII (≤ 5 lượt gồm câu shop, bình luận cha, caption, tên
 * sản phẩm gắn bài, ≤ 3 câu hỏi bài khác trong 7 ngày, trạng thái có cấu trúc) và đếm câu AI cho (khách, bài) trong 24 giờ.
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let channel: string;
let post: string;
let post2: string;

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms);
const PHONE = '0912345678';

async function addComment(over: {
  text?: string;
  author?: string;
  postId?: string;
  createdAt?: Date;
  parent?: string | null;
  externalId?: string;
}): Promise<{ id: string; externalId: string }> {
  const externalId = over.externalId ?? `cm-${randomUUID()}`;
  const r = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, parent_external_id, author_external_id, author_name, text, created_time, ingest_source)
     VALUES ($1, $2, $3, $4, $5, $6, 'Khách', $7, $8, 'webhook') RETURNING id`,
    [
      ws,
      channel,
      over.postId ?? post,
      externalId,
      over.parent ?? null,
      over.author ?? 'u1',
      over.text ?? 'x',
      over.createdAt ?? new Date(),
    ],
  );
  return { id: r.rows[0].id as string, externalId };
}

async function addDraft(
  commentId: string,
  action: string,
  over: { createdAt?: Date; contextRefs?: unknown[] } = {},
) {
  await admin.query(
    `INSERT INTO cf.drafts (workspace_id, target_type, target_id, text, lang, action, context_refs, created_at)
     VALUES ($1, 'comment', $2, 'câu', 'vi', $3, $4::jsonb, $5)`,
    [ws, commentId, action, JSON.stringify(over.contextRefs ?? []), over.createdAt ?? new Date()],
  );
}

const load = (id: string) =>
  db
    .withJob(ws, (tx) => loadPipelineContext(tx, ws, id, new Date()))
    .then((c) => {
      if (!c) throw new Error('không có ngữ cảnh');
      return c;
    });

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Shop') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  const mk = async (caption: string) =>
    (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id, message) VALUES ($1, $2, $3, $4) RETURNING id',
        [ws, channel, `post-${randomUUID()}`, caption],
      )
    ).rows[0].id as string;
  post = await mk(`Áo thun basic, nhắn ${PHONE}`);
  post2 = await mk('Bài khác');
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('ngữ cảnh hội thoại', () => {
  it('lượt trước + câu shop đã gửi, cũ → mới, ≤ 5, ĐÃ che PII; caption đã che', async () => {
    const author = `a-${randomUUID()}`;
    const first = await addComment({
      author,
      text: `áo thun basic giá bn, sđt ${PHONE}`,
      createdAt: ago(3 * HOUR),
    });
    for (let i = 0; i < 6; i += 1) {
      await addComment({ author, text: `lượt ${i}`, createdAt: ago(2 * HOUR - i * 1000) });
    }
    await admin.query(
      "INSERT INTO cf.comment_replies (workspace_id, channel_id, comment_id, text, status, previous_status, sent_at) VALUES ($1, $2, $3, 'Dạ shop hỏi size ạ', 'sent', 'new', $4)",
      [ws, channel, first.id, ago(150 * 60_000)],
    );
    const current = await addComment({ author, text: 'M đen' });
    const ctx = await load(current.id);
    expect(ctx.convo.turns.length).toBeLessThanOrEqual(5);
    expect(ctx.convo.turns.map((t) => t.at.getTime())).toEqual(
      [...ctx.convo.turns.map((t) => t.at.getTime())].sort((a, b) => a - b),
    );
    expect(JSON.stringify(ctx.convo)).not.toContain(PHONE);
    expect(ctx.convo.postCaption).toContain('[sđt]');
    // Câu shop nằm trong 5 lượt gần nhất khi đủ mới.
    const withShop = await load((await addComment({ author: `b-${randomUUID()}` })).id);
    expect(withShop.convo.turns).toEqual([]);
  });

  it('câu shop đã gửi xuất hiện như lượt `shop` (chuỗi ngắn)', async () => {
    const author = `c-${randomUUID()}`;
    const q = await addComment({ author, text: 'áo thun basic giá bn', createdAt: ago(2 * HOUR) });
    await admin.query(
      "INSERT INTO cf.comment_replies (workspace_id, channel_id, comment_id, text, status, previous_status, sent_at) VALUES ($1, $2, $3, 'Dạ shop hỏi size ạ', 'sent', 'new', $4)",
      [ws, channel, q.id, ago(HOUR)],
    );
    const ctx = await load((await addComment({ author, text: 'M đen' })).id);
    expect(ctx.convo.turns.map((t) => [t.from, t.text])).toEqual([
      ['customer', 'áo thun basic giá bn'],
      ['shop', 'Dạ shop hỏi size ạ'],
    ]);
  });

  it('bình luận cha, câu hỏi ở bài khác trong 7 ngày (≤ 3, mới → cũ; quá 7 ngày bỏ), trạng thái có cấu trúc từ bản nháp gần nhất', async () => {
    const author = `d-${randomUUID()}`;
    const parent = await addComment({
      author: 'khac',
      text: 'bình luận gốc',
      createdAt: ago(5 * HOUR),
    });
    for (let i = 0; i < 4; i += 1) {
      await addComment({
        author,
        postId: post2,
        text: `bài khác ${i}`,
        createdAt: ago((i + 1) * 24 * HOUR),
      });
    }
    await addComment({ author, postId: post2, text: 'quá cũ', createdAt: ago(9 * 24 * HOUR) });
    const prev = await addComment({ author, text: 'áo thun giá bn', createdAt: ago(2 * HOUR) });
    const state = { type: 'state', productIds: [randomUUID()], pendingAsks: ['giá'] };
    await addDraft(prev.id, 'clarify', { contextRefs: [{ type: 'thread' }, state] });
    const cur = await addComment({ author, text: 'M đen', parent: parent.externalId });
    const ctx = await load(cur.id);
    expect(ctx.convo.parentComment).toBe('bình luận gốc');
    expect(ctx.convo.otherQuestions.map((q) => q.text)).toEqual([
      'bài khác 0',
      'bài khác 1',
      'bài khác 2',
    ]);
    expect(ctx.convo.stateRaw).toEqual(state);
  });

  it('tên sản phẩm gắn bài (đã xác nhận, sản phẩm chính trước)', async () => {
    const p = (
      await admin.query(
        "INSERT INTO cf.products (workspace_id, name, search_text) VALUES ($1, 'Áo thun basic', 'ao thun basic') RETURNING id",
        [ws],
      )
    ).rows[0].id;
    await admin.query(
      "INSERT INTO cf.post_products (workspace_id, post_id, product_id, status, is_primary, suggested_by_ai) VALUES ($1, $2, $3, 'confirmed', true, false)",
      [ws, post, p],
    );
    const ctx = await load((await addComment({})).id);
    expect(ctx.convo.postProductNames).toEqual(['Áo thun basic']);
  });
});

describe('FR-167 — đếm câu AI cho (khách, bài) trong 24 giờ', () => {
  it('gộp MỌI bình luận của khách dưới bài; không tính handoff, bài khác, khách khác, quá 24 giờ, chính bình luận này', async () => {
    const author = `cap-${randomUUID()}`;
    const c1 = await addComment({ author, createdAt: ago(5 * HOUR) });
    const c2 = await addComment({ author, createdAt: ago(4 * HOUR) });
    const c3 = await addComment({ author, createdAt: ago(3 * HOUR) });
    await addDraft(c1.id, 'answer');
    await addDraft(c2.id, 'clarify');
    await addDraft(c3.id, 'handoff'); // chỗ giữ "Cần nhân viên" — không phải câu trả lời
    const old = await addComment({ author, createdAt: ago(40 * HOUR) });
    await addDraft(old.id, 'answer', { createdAt: ago(30 * HOUR) });
    const elsewhere = await addComment({ author, postId: post2 });
    await addDraft(elsewhere.id, 'answer');
    const stranger = await addComment({ author: `x-${randomUUID()}` });
    await addDraft(stranger.id, 'answer');
    const cur = await addComment({ author });
    await addDraft(cur.id, 'answer'); // bản nháp của CHÍNH bình luận (chạy lại) không tính
    expect((await load(cur.id)).customerPostReplies24h).toBe(2);
  });

  it('mặc định trần = 3; Owner đổi 1–5 có hiệu lực; ngoài 1–5 bị CHECK chặn', async () => {
    expect((await load((await addComment({})).id)).settings.maxAiRepliesPerCustomerPost).toBe(3);
    await admin.query(
      'INSERT INTO cf.automation_settings (workspace_id, max_ai_replies_per_customer_post) VALUES ($1, 5)',
      [ws],
    );
    expect((await load((await addComment({})).id)).settings.maxAiRepliesPerCustomerPost).toBe(5);
    await expect(
      admin.query(
        'UPDATE cf.automation_settings SET max_ai_replies_per_customer_post = 6 WHERE workspace_id = $1',
        [ws],
      ),
    ).rejects.toThrow();
    await expect(
      admin.query(
        'UPDATE cf.automation_settings SET max_ai_replies_per_customer_post = 0 WHERE workspace_id = $1',
        [ws],
      ),
    ).rejects.toThrow();
  });
});

describe('FR-167 — độ ưu tiên: bình luận đầu tiên của khách dưới bài', () => {
  it('chưa có câu AI nào trong 24 giờ → 0 (được ưu tiên); đã có → > 0; không tồn tại → null', async () => {
    const author = `pri-${randomUUID()}`;
    const first = await addComment({ author, createdAt: ago(2 * HOUR) });
    const now = new Date();
    const count = (id: string) =>
      db.withJob(ws, (tx) => countRepliesForCommentThread(tx, ws, id, now));
    expect(await count(first.id)).toBe(0);
    await addDraft(first.id, 'answer');
    const second = await addComment({ author });
    expect(await count(second.id)).toBe(1);
    expect(await count(first.id)).toBe(0); // bản nháp của chính bình luận không tính
    expect(await count(randomUUID())).toBeNull();
  });
});
