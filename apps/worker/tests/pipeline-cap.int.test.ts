import { randomUUID } from 'node:crypto';
import { createFixtureDrafter, createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '@flow/ai';
import { createDb, type FlowDb } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type PipelineJobConfig, runPipelineJob } from '../src/jobs/pipeline-job';

/**
 * FR-167 / Q-POR14: trần trả lời theo (khách, bài) trong 24 giờ, trên DB thật. Cả ba kiểu bình luận (chuỗi trả lời nối nhau; bình luận
 * mới riêng lẻ; xen kẽ) cho CÙNG kết quả với trần 3: câu 1–2 trả lời, câu 3 là câu CHỐT (redirect mời nhắn tin + Cần hỗ trợ thêm), câu 4–5
 * `needs_human` lý do `customer_post_reply_cap`, KHÔNG gọi LLM và KHÔNG trừ lượt. Bài khác không bị ảnh hưởng; qua 24 giờ trả lời lại.
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let channel: string;
let post: string;
let post2: string;
let extractCalls = 0;
let draftCalls = 0;

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 6 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 3 });
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

beforeEach(async () => {
  extractCalls = 0;
  draftCalls = 0;
  ws = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop trần',
    `shop-${ws}`,
  ]);
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Trang') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  const mkPost = async () =>
    (
      await admin.query(
        'INSERT INTO cf.posts (workspace_id, channel_id, external_id) VALUES ($1, $2, $3) RETURNING id',
        [ws, channel, `post-${randomUUID()}`],
      )
    ).rows[0].id as string;
  post = await mkPost();
  post2 = await mkPost();
  const src = (
    await admin.query(
      "INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', 'Ship') RETURNING id",
      [ws],
    )
  ).rows[0].id;
  const ver = (
    await admin.query(
      'INSERT INTO cf.kb_versions (workspace_id, number) VALUES ($1, 1) RETURNING id',
      [ws],
    )
  ).rows[0].id;
  await admin.query(
    `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash, is_draft)
     VALUES ($1, $2, $3, 'ship', 'Phí ship nội thành 20.000đ, giao trong 2 ngày', 'vi', 'h-ship', false)`,
    [ws, src, ver],
  );
});

const config = (): PipelineJobConfig => ({
  db,
  llm: {
    extractor: {
      extract: async (input) => {
        extractCalls += 1;
        return createFixtureExtractor([
          {
            match: /./,
            result: {
              ...FIXTURE_EXTRACT_DEFAULT,
              labels: [{ label: 'advice' }],
              asks: ['phí ship'],
            },
          },
        ]).extract(input);
      },
    },
    drafter: {
      draft: async (input) => {
        draftCalls += 1;
        return createFixtureDrafter([
          {
            match: /./,
            result: {
              reply: 'Phí ship nội thành 20.000đ ạ',
              lang: 'vi',
              sources: [],
              claims: [],
              unanswered_topics: [],
              needs_human: false,
              reason: '',
              variants: [],
            },
          },
        ]).draft(input);
      },
    },
  },
  pipelineEnabled: async () => true,
  turnLimit: 100,
});

/** Thêm một bình luận của khách; `hoursAgo` cách nhau > cửa sổ gộp nên không bị gộp. */
async function add(
  author: string,
  hoursAgo: number,
  over: { postId?: string; parent?: string | null } = {},
): Promise<{ id: string; externalId: string }> {
  const externalId = `cm-${randomUUID()}`;
  const r = await admin.query(
    `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, parent_external_id, author_external_id, author_name, text, status, ingest_source, created_time)
     VALUES ($1, $2, $3, $4, $5, $6, 'Khách', 'ship nội thành bao nhiêu ' || $8::text, 'new', 'webhook', now() - make_interval(secs => $7)) RETURNING id`,
    [
      ws,
      channel,
      over.postId ?? post,
      externalId,
      over.parent ?? null,
      author,
      hoursAgo * 3600,
      randomUUID().slice(0, 8),
    ],
  );
  return { id: r.rows[0].id as string, externalId };
}

const run = (id: string) =>
  runPipelineJob(config(), { workspaceId: ws, commentId: id, trigger: 'auto' });
const draftsOf = async (id: string) =>
  (
    await admin.query('SELECT action, reason, needs_human FROM cf.drafts WHERE target_id = $1', [
      id,
    ])
  ).rows;
const statusOf = async (id: string) =>
  (await admin.query('SELECT status FROM cf.comments WHERE id = $1', [id])).rows[0]
    .status as string;
const turnsUsed = async () =>
  Number(
    (
      await admin.query(
        'SELECT coalesce(sum(used),0) n FROM core.usage_counters WHERE workspace_id = $1',
        [ws],
      )
    ).rows[0].n,
  );

/** Kỳ vọng chung của cả ba kịch bản với trần 3. */
async function expectCapBehaviour(ids: string[]) {
  const outcomes = [];
  for (const id of ids) {
    const before = { e: extractCalls, d: draftCalls };
    outcomes.push(await run(id));
    // Câu 4–5 (vượt trần) không gọi LLM nào.
    if (ids.indexOf(id) >= 3) expect({ e: extractCalls, d: draftCalls }).toEqual(before);
  }
  // Câu 1–2: trả lời thật (không phải handoff), qua extract + soạn.
  for (const id of ids.slice(0, 2)) {
    const [d] = await draftsOf(id);
    expect(d?.action).not.toBe('handoff');
  }
  // Câu 3: câu CHỐT.
  const [closing] = await draftsOf(ids[2] as string);
  expect(closing).toMatchObject({ action: 'redirect', reason: 'customer_post_reply_cap' });
  expect(await statusOf(ids[2] as string)).toBe('pending_review');
  // Câu 4–5: needs_human, không tốn lượt thêm.
  for (const id of ids.slice(3)) {
    expect(await draftsOf(id)).toEqual([
      { action: 'handoff', reason: 'customer_post_reply_cap', needs_human: true },
    ]);
    expect(await statusOf(id)).toBe('needs_human');
  }
  expect(outcomes.slice(3).every((o) => o.kind === 'handoff')).toBe(true);
  // Chỉ 3 lượt được trừ (câu 1–3); câu 4–5 không trừ.
  expect(await turnsUsed()).toBe(3);
  // Câu chốt KHÔNG gọi extract: 2 lần extract (câu 1–2) và 3 lần soạn (câu 1–3).
  expect(extractCalls).toBe(2);
  expect(draftCalls).toBe(3);
}

describe('FR-167 — trần 3 câu AI cho (khách, bài) trong 24 giờ', () => {
  it('(a) 5 câu trong MỘT chuỗi (mỗi câu trả lời câu trước)', async () => {
    const author = `a-${randomUUID()}`;
    const ids: string[] = [];
    let parent: string | null = null;
    for (let i = 0; i < 5; i += 1) {
      const c = await add(author, 10 - i * 2, { parent });
      ids.push(c.id);
      parent = c.externalId;
    }
    await expectCapBehaviour(ids);
  });

  it('(b) 5 bình luận MỚI riêng lẻ dưới cùng bài', async () => {
    const author = `b-${randomUUID()}`;
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push((await add(author, 10 - i * 2)).id);
    await expectCapBehaviour(ids);
  });

  it('(c) xen kẽ chuỗi + bình luận mới → cùng kết quả (đếm gộp mọi chuỗi)', async () => {
    const author = `c-${randomUUID()}`;
    const first = await add(author, 10);
    const second = await add(author, 8); // bình luận mới
    const third = await add(author, 6, { parent: first.externalId }); // trả lời chuỗi đầu
    const fourth = await add(author, 4); // bình luận mới
    const fifth = await add(author, 2, { parent: second.externalId }); // trả lời chuỗi hai
    await expectCapBehaviour([first.id, second.id, third.id, fourth.id, fifth.id]);
  });

  it('(d) cùng khách ở BÀI KHÁC vẫn được trả lời bình thường', async () => {
    const author = `d-${randomUUID()}`;
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push((await add(author, 10 - i * 2)).id);
    for (const id of ids) await run(id);
    const elsewhere = await add(author, 1, { postId: post2 });
    const out = await run(elsewhere.id);
    expect(out.kind).toBe('written');
    const [d] = await draftsOf(elsewhere.id);
    expect(d?.action).not.toBe('handoff');
    expect(d?.reason).not.toBe('customer_post_reply_cap');
  });

  it('(e) sau 24 giờ được trả lời lại', async () => {
    const author = `e-${randomUUID()}`;
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push((await add(author, 10 - i * 2)).id);
    for (const id of ids) await run(id);
    // Lùi toàn bộ bản nháp cũ quá 24 giờ (admin được phép sửa mốc thời gian trong test).
    await admin.query(
      "UPDATE cf.drafts SET created_at = now() - interval '25 hours' WHERE workspace_id = $1",
      [ws],
    );
    const again = await add(author, 0);
    const out = await run(again.id);
    expect(out.kind).toBe('written');
    const [d] = await draftsOf(again.id);
    expect(d?.action).not.toBe('handoff');
    expect(d?.reason).not.toBe('customer_post_reply_cap');
  });

  it('trần do Owner chỉnh (1–5) có hiệu lực: trần 1 → câu đầu là câu chốt, câu hai vượt trần', async () => {
    await admin.query(
      'INSERT INTO cf.automation_settings (workspace_id, max_ai_replies_per_customer_post) VALUES ($1, 1)',
      [ws],
    );
    const author = `f-${randomUUID()}`;
    const a = await add(author, 4);
    const b = await add(author, 2);
    await run(a.id);
    await run(b.id);
    expect((await draftsOf(a.id))[0]).toMatchObject({
      action: 'redirect',
      reason: 'customer_post_reply_cap',
    });
    expect((await draftsOf(b.id))[0]).toMatchObject({
      action: 'handoff',
      reason: 'customer_post_reply_cap',
    });
  });
});
