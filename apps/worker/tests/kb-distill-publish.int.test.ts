import { randomUUID } from 'node:crypto';
import {
  createDemoKnowledge,
  createKbTryKnowledge,
  createMockEmbedder,
  defaultKbPublishOps,
  type EmbeddingConfig,
  runKbPublish,
  runKbSync,
} from '@flow/ai';
import { createDb, type FlowDb, getCurrentVersion, searchKbChunks } from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * M3-2: đồng bộ → xuất bản → tìm kiếm. Khi xuất bản, đoạn nháp được CHÉP sang mã mới, nên quy tắc "bỏ FAQ chắt lọc khi đoạn thô nguồn đã có
 * trong kết quả" phải so theo `chunk_key` (`metadata.source_chunk_key`), không theo mã đoạn nháp. Embedder giả chỉ cắm ở TEST qua tham số.
 */
const MODEL = 'kb-distill-publish-test-model';
const RAW_TEXT = 'Áo thun làm từ cotton 100%, xuất xứ Việt Nam.';
let db: FlowDb;
let admin: pg.Pool;
let previousModel: string | null = null;

const mlConfig: EmbeddingConfig = {
  kind: 'ml',
  model: MODEL,
  embedder: createMockEmbedder(MODEL),
  describe: { kind: 'ml', model: MODEL, note: 'test' },
};

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !adminUrl)
    throw new Error('Thiếu TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  db = createDb({ connectionString: url, max: 4 });
  admin = new pg.Pool({ connectionString: adminUrl, max: 3 });
  previousModel = (await admin.query('SELECT active_model FROM cf.embedding_state')).rows[0]
    ?.active_model;
  await admin.query('UPDATE cf.embedding_state SET active_model = $1', [MODEL]);
});
afterAll(async () => {
  await admin.query('UPDATE cf.embedding_state SET active_model = $1', [previousModel]);
  await db.close();
  await admin.end();
});

describe('FAQ chắt lọc qua đồng bộ → xuất bản → tìm kiếm', () => {
  it('đoạn FAQ chắt lọc bị bỏ khi đoạn thô nguồn có trong kết quả (so theo chunk_key, bền qua xuất bản)', async () => {
    const ws = randomUUID();
    const owner = randomUUID();
    await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
      ws,
      'Shop chắt lọc',
      `shop-${ws}`,
    ]);
    await admin.query('INSERT INTO core.users (id, email, name) VALUES ($1, $2, $3)', [
      owner,
      `${owner}@example.test`,
      'Owner',
    ]);
    await admin.query(
      'INSERT INTO cf.policy_items (workspace_id, kind, lang, title, content) VALUES ($1, $2, $3, $4, $5)',
      [ws, 'other', 'vi', 'Chất liệu', RAW_TEXT],
    );
    const sync = () =>
      db.withJob(ws, (tx) =>
        runKbSync(tx, { workspaceId: ws }, { resolveEmbedding: async () => mlConfig }),
      );
    await sync();
    const raw = (
      await admin.query(
        `SELECT c.id, c.chunk_key FROM cf.kb_chunks c JOIN cf.kb_sources s ON s.id = c.source_id
          WHERE c.workspace_id = $1 AND c.is_draft AND s.external_key = 'sync:policy'`,
        [ws],
      )
    ).rows[0] as { id: string; chunk_key: string };
    // FAQ chắt lọc: chèn nháp rồi duyệt bằng quyền quản trị (thay Owner; chỉ DB test).
    const faqId = (
      await admin.query(
        `INSERT INTO cf.faq_items (workspace_id, question, answer, lang, status, kind, evidence_quote, source_chunk_id)
         VALUES ($1, 'Áo làm từ chất liệu gì?', 'Áo làm từ cotton 100%.', 'vi', 'draft', 'faq', $2, $3) RETURNING id`,
        [ws, RAW_TEXT, raw.id],
      )
    ).rows[0].id as string;
    await admin.query(`UPDATE cf.faq_items SET status = 'published' WHERE id = $1`, [faqId]);
    await sync();
    const draftMeta = (
      await admin.query(
        `SELECT metadata FROM cf.kb_chunks WHERE workspace_id = $1 AND is_draft AND chunk_key = $2`,
        [ws, `faq:${faqId}#0`],
      )
    ).rows[0].metadata as Record<string, unknown>;
    expect(draftMeta).toMatchObject({
      source_chunk_id: raw.id,
      source_chunk_key: raw.chunk_key,
      distill_kind: 'faq',
    });

    const published = await db.withJob(ws, (tx) =>
      runKbPublish(
        tx,
        { kind: 'publish', workspaceId: ws, requestedBy: owner },
        { ...defaultKbPublishOps, isActiveOwner: async () => true },
      ),
    );
    expect(published.outcome).toBe('created');
    const version = await db.withJob(ws, (tx) => getCurrentVersion(tx, ws));
    if (!version) throw new Error('chưa có phiên bản');

    const searcher = (input: {
      queryText: string;
      lang: 'vi' | 'en';
      productIds: readonly string[];
    }) =>
      db.withJob(ws, (tx) =>
        searchKbChunks(tx, {
          workspaceId: ws,
          versionId: version.id,
          lang: input.lang,
          queryText: input.queryText,
          productIds: input.productIds,
        }),
      );
    const query = 'áo làm từ cotton 100% phải không';
    const hits = await searcher({ queryText: query, lang: 'vi', productIds: [] });
    const publishedFaq = hits.find((h) => h.chunkKey === `faq:${faqId}#0`);
    const publishedRaw = hits.find((h) => h.chunkKey === raw.chunk_key);
    // Điều kiện của kịch bản: cả hai cùng có mặt, mã đoạn nguồn nháp KHÁC mã đã xuất bản, metadata sống sót qua xuất bản.
    expect(publishedFaq).toBeTruthy();
    expect(publishedRaw).toBeTruthy();
    expect(publishedRaw?.id).not.toBe(raw.id);
    expect(publishedFaq?.metadata).toMatchObject({ source_chunk_key: raw.chunk_key });

    const knowledge = createKbTryKnowledge({ searcher, base: createDemoKnowledge() });
    const out = await knowledge.searchKb(query, { lang: 'vi', productIds: [] });
    expect(out.some((c) => c.id === `kb:${publishedRaw?.id}`)).toBe(true);
    expect(out.some((c) => c.id === `kb:${publishedFaq?.id}`)).toBe(false);
  });
});
