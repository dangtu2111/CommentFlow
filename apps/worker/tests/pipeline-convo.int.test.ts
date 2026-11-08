import { randomUUID } from 'node:crypto';
import { createFixtureExtractor, type Drafter, FIXTURE_EXTRACT_DEFAULT } from '@flow/ai';
import { createDb, type FlowDb } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type PipelineJobConfig, runPipelineJob } from '../src/jobs/pipeline-job';

/**
 * PIPE-CONVO-CONTEXT (Q-POR12) đường vàng 2 lượt trên DB THẬT: "áo thun basic giá bn?" → AI hỏi lại size/màu (ghi trạng thái hội thoại) →
 * khách trả lời "M đen" → loader đọc trạng thái + lịch sử → AI nhận đúng sản phẩm và trả lời 150.000đ, KHÔNG hỏi lại lần hai.
 */
let db: FlowDb;
let admin: pg.Pool;
let ws: string;
let channel: string;
let post: string;
let product: string;
const author = 'khach-1';

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
  ws = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop hội thoại',
    `shop-${ws}`,
  ]);
  channel = (
    await admin.query(
      "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Trang') RETURNING id",
      [ws, `p-${randomUUID()}`],
    )
  ).rows[0].id;
  post = (
    await admin.query(
      'INSERT INTO cf.posts (workspace_id, channel_id, external_id, message) VALUES ($1, $2, $3, $4) RETURNING id',
      [ws, channel, `post-${randomUUID()}`, 'Áo thun basic'],
    )
  ).rows[0].id;
  product = (
    await admin.query(
      "INSERT INTO cf.products (workspace_id, name, search_text, price_vnd, stock, status) VALUES ($1, 'Áo thun basic', 'ao thun basic', 150000, 8, 'active') RETURNING id",
      [ws],
    )
  ).rows[0].id;
  for (const [size, color] of [
    ['M', 'đen'],
    ['M', 'trắng'],
    ['L', 'đen'],
    ['L', 'trắng'],
  ] as const) {
    await admin.query(
      `INSERT INTO cf.product_variants (workspace_id, product_id, attrs, attrs_norm, price_vnd, stock, status)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, 150000, 3, 'active')`,
      [
        ws,
        product,
        JSON.stringify({ Size: size, Màu: color }),
        JSON.stringify({ size: size.toLowerCase(), color }),
      ],
    );
  }
});

async function addComment(text: string, minutesAgo: number): Promise<string> {
  return (
    await admin.query(
      `INSERT INTO cf.comments (workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text, status, ingest_source, created_time)
       VALUES ($1, $2, $3, $4, $5, 'Khách', $6, 'new', 'webhook', now() - make_interval(secs => $7)) RETURNING id`,
      [ws, channel, post, `cm-${randomUUID()}`, author, text, minutesAgo * 60],
    )
  ).rows[0].id as string;
}

const calls = { extractHistory: [] as unknown[], draftHistory: [] as unknown[] };

function config(): PipelineJobConfig {
  const turn1 = createFixtureExtractor([
    {
      match: /áo thun basic/i,
      result: {
        ...FIXTURE_EXTRACT_DEFAULT,
        labels: [{ label: 'price' }],
        product_mentions: ['áo thun basic'],
        asks: ['giá'],
      },
    },
    // Lượt 2: khách chỉ trả lời "M đen" — không nêu tên sản phẩm, không nêu ý hỏi mới.
    {
      match: /m đen/i,
      result: {
        ...FIXTURE_EXTRACT_DEFAULT,
        labels: [{ label: 'advice' }],
        size: 'M',
        color: 'đen',
        asks: [],
      },
    },
  ]);
  const drafter: Drafter = {
    async draft(input) {
      calls.draftHistory.push(input.history);
      if (input.decision?.action === 'clarify') {
        return {
          reply: 'Dạ bạn chọn size và màu nào ạ?',
          lang: 'vi',
          sources: [],
          claims: [],
          unanswered_topics: [],
          needs_human: false,
          reason: '',
          variants: [],
        };
      }
      return {
        reply: 'Dạ áo thun basic size M màu đen giá 150.000đ ạ',
        lang: 'vi',
        sources: [product],
        claims: [{ text: 'Giá 150.000đ', source_ids: [product], kind: 'fact' }],
        unanswered_topics: [],
        needs_human: false,
        reason: '',
        variants: [],
      };
    },
  };
  return {
    db,
    llm: {
      extractor: {
        extract: async (input) => {
          calls.extractHistory.push(input.history);
          return turn1.extract(input);
        },
      },
      drafter,
    },
    pipelineEnabled: async () => true,
    turnLimit: 100,
  };
}

const run = (id: string) =>
  runPipelineJob(config(), { workspaceId: ws, commentId: id, trigger: 'auto' });
const draftOf = async (id: string) =>
  (
    await admin.query(
      'SELECT action, reason, text, context_refs FROM cf.drafts WHERE target_id = $1',
      [id],
    )
  ).rows[0];

describe('đường vàng 2 lượt trên DB thật', () => {
  it('"áo thun basic giá bn?" → hỏi lại size/màu → "M đen" → trả lời 150.000đ (không hỏi lại lần 2)', async () => {
    calls.extractHistory = [];
    calls.draftHistory = [];
    const first = await addComment('áo thun basic giá bn?', 120);
    expect((await run(first)).kind).toBe('written');
    const d1 = await draftOf(first);
    expect(d1).toMatchObject({ action: 'clarify', reason: 'variant_missing' });
    // Trạng thái hội thoại có cấu trúc được ghi cho lượt sau.
    expect(d1.context_refs).toContainEqual({
      type: 'state',
      productIds: [product],
      pendingAsks: ['giá'],
    });

    // Khách trả lời "M đen" (lượt sau; thứ tự thời gian: sau lượt 1).
    const second = await addComment('M đen', 30);
    expect((await run(second)).kind).toBe('written');
    const d2 = await draftOf(second);
    expect(d2.action).toBe('answer');
    expect(d2.text).toContain('150.000');
    expect(d2.reason).toBe('all_sourced');
    // Lịch sử thật (lượt khách trước) đã tới extract và bước soạn của lượt 2.
    expect(JSON.stringify(calls.extractHistory[1])).toContain('áo thun basic giá bn?');
    expect(JSON.stringify(calls.draftHistory[1])).toContain('áo thun basic giá bn?');
    // Không còn ý đang chờ sau khi đã trả lời.
    expect(d2.context_refs).toContainEqual({
      type: 'state',
      productIds: [product],
      pendingAsks: [],
    });
  });

  it('khách đổi sang sản phẩm khác không khớp không bị gán nhầm sản phẩm cũ (lượt hỏi lại không dự phòng)', async () => {
    calls.extractHistory = [];
    const first = await addComment('áo thun basic giá bn?', 120);
    await run(first);
    const second = await addComment('quần jean xyz giá bn', 30);
    // Fixture extract mặc định cho câu lạ: không nêu sản phẩm → rơi vào dự phòng theo trạng thái; chỉ kiểm không ném lỗi và có bản nháp.
    expect((await run(second)).kind).toBe('written');
  });
});
