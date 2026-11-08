import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createKbVersionFromChunks,
  getCurrentVersion,
  getVersionByNumber,
  listChunkSummaries,
  listKbVersions,
  lockKbPublish,
} from '../src/queries/kb-publish';
import {
  createAdminPool,
  createAppDb,
  seedUser,
  seedWorkspace,
  setActiveEmbeddingModel,
} from './helpers';

/**
 * KB-PUBLISH-VERSION (FR-054, UF-8): nháp → phiên bản bất biến, khôi phục = phiên bản mới. Ghi chỉ qua `withJob`.
 * Chạy ở CI/DB làn b (làn d không có DB).
 */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let user: string;
let faq: string;
let faqOther: string;

const vec = `[${Array.from({ length: 1024 }, () => 0.1).join(',')}]`;

async function addDraft(
  workspaceId: string,
  sourceId: string,
  key: string,
  hash: string,
  bad = false,
) {
  await admin.query(
    `INSERT INTO cf.kb_chunks (workspace_id, source_id, version_id, chunk_key, content, lang, content_hash,
       embedding, is_draft, injection_suspected, embedding_model)
     VALUES ($1, $2, NULL, $3, $4, 'vi', $5, $6::halfvec, true, $7, 'mock-embed-v1')`,
    [workspaceId, sourceId, key, `nội dung ${key}`, hash, vec, bad],
  );
}

async function newSource(workspaceId: string, type = 'faq'): Promise<string> {
  const r = await admin.query(
    'INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, $2, $3) RETURNING id',
    [workspaceId, type, 'Nguồn'],
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  admin = createAdminPool();
  await setActiveEmbeddingModel(admin, 'mock-embed-v1');
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  user = await seedUser(admin);
  faq = await newSource(ws);
  faqOther = await newSource(other);
  await addDraft(ws, faq, 'a#0', 'h-a');
  await addDraft(ws, faq, 'b#0', 'h-b');
  await addDraft(ws, faq, 'evil#0', 'h-e', true);
  await addDraft(other, faqOther, 'z#0', 'h-z');
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

const publish = (workspaceId: string, number: number, sourceId: string, keys: string[]) =>
  db.withJob(workspaceId, async (tx) => {
    await lockKbPublish(tx, workspaceId);
    return createKbVersionFromChunks(tx, workspaceId, {
      number,
      publishedBy: user,
      note: 'ghi chú',
      changedCategories: ['faq'],
      scope: { kind: 'draft' },
      keys: keys.map((chunkKey) => ({ sourceId, chunkKey })),
    });
  });

describe('FR-054 xuất bản nháp', () => {
  it('chưa có phiên bản → getCurrentVersion rỗng', async () => {
    expect(await db.withWorkspace(ws, (tx) => getCurrentVersion(tx, ws))).toBeNull();
  });

  it('sao đúng đoạn được chọn, bỏ đoạn nghi cài lệnh, giữ nguyên nháp', async () => {
    const out = await publish(ws, 1, faq, ['a#0', 'b#0', 'evil#0']);
    expect(out.copied).toBe(2);
    const rows = (
      await admin.query(
        'SELECT chunk_key, is_draft, injection_suspected, version_id FROM cf.kb_chunks WHERE workspace_id=$1 AND version_id IS NOT NULL ORDER BY chunk_key',
        [ws],
      )
    ).rows;
    expect(rows.map((r) => r.chunk_key)).toEqual(['a#0', 'b#0']);
    expect(rows.every((r) => r.is_draft === false && r.injection_suspected === false)).toBe(true);
    const drafts = await admin.query(
      'SELECT count(*)::int AS n FROM cf.kb_chunks WHERE workspace_id=$1 AND version_id IS NULL',
      [ws],
    );
    expect(drafts.rows[0].n).toBe(3);
  });

  it('phiên bản đang chạy = số lớn nhất; danh sách có số đoạn, nhóm, ghi chú', async () => {
    await publish(ws, 2, faq, ['a#0']);
    const cur = await db.withWorkspace(ws, (tx) => getCurrentVersion(tx, ws));
    expect(cur?.number).toBe(2);
    const list = await db.withWorkspace(ws, (tx) => listKbVersions(tx, ws));
    expect(list.map((v) => [v.number, v.chunkCount])).toEqual([
      [2, 1],
      [1, 2],
    ]);
    expect(list[0]).toMatchObject({
      note: 'ghi chú',
      changedCategories: ['faq'],
      publishedBy: user,
    });
  });

  it('khôi phục: sao đoạn của phiên bản cũ thành phiên bản mới, bản cũ không đổi', async () => {
    const v1 = await db.withWorkspace(ws, (tx) => getVersionByNumber(tx, ws, 1));
    if (!v1) throw new Error('thiếu v1');
    const summaries = await db.withWorkspace(ws, (tx) =>
      listChunkSummaries(tx, ws, { kind: 'version', versionId: v1.id }),
    );
    expect(summaries.map((s) => s.chunkKey)).toEqual(['a#0', 'b#0']);
    const out = await db.withJob(ws, async (tx) => {
      await lockKbPublish(tx, ws);
      return createKbVersionFromChunks(tx, ws, {
        number: 3,
        publishedBy: user,
        note: null,
        changedCategories: ['faq'],
        scope: { kind: 'version', versionId: v1.id },
        keys: summaries.map((s) => ({ sourceId: s.sourceId, chunkKey: s.chunkKey })),
      });
    });
    expect(out.copied).toBe(2);
    const v1Chunks = await admin.query(
      'SELECT count(*)::int AS n FROM cf.kb_chunks WHERE version_id = $1',
      [v1.id],
    );
    expect(v1Chunks.rows[0].n).toBe(2);
  });

  it('số phiên bản trùng bị unique chặn (không ghi đè)', async () => {
    await expect(publish(ws, 3, faq, ['a#0'])).rejects.toThrow();
  });

  it('nháp bỏ nguồn đã xóa mềm khỏi tóm tắt', async () => {
    const gone = await newSource(ws);
    await addDraft(ws, gone, 'g#0', 'h-g');
    await admin.query('UPDATE cf.kb_sources SET deleted_at = now() WHERE id = $1', [gone]);
    const s = await db.withWorkspace(ws, (tx) => listChunkSummaries(tx, ws, { kind: 'draft' }));
    expect(s.map((x) => x.chunkKey)).not.toContain('g#0');
  });
});

describe('FR-054 cách ly workspace và quyền', () => {
  it('workspace khác không thấy phiên bản/đoạn của ws', async () => {
    expect(await db.withWorkspace(other, (tx) => listKbVersions(tx, other))).toEqual([]);
    const s = await db.withWorkspace(other, (tx) =>
      listChunkSummaries(tx, other, { kind: 'draft' }),
    );
    expect(s.map((x) => x.chunkKey)).toEqual(['z#0']);
  });

  it('khóa chéo workspace: không sao đoạn của workspace khác dù khai đúng khóa', async () => {
    const out = await db.withJob(other, async (tx) => {
      await lockKbPublish(tx, other);
      return createKbVersionFromChunks(tx, other, {
        number: 1,
        publishedBy: user,
        note: null,
        changedCategories: ['faq'],
        scope: { kind: 'draft' },
        keys: [{ sourceId: faq, chunkKey: 'a#0' }],
      });
    });
    expect(out.copied).toBe(0);
  });

  it('ghi bằng withActor (không phải hệ thống) bị từ chối ở kb_chunks', async () => {
    await expect(
      db.withActor(ws, user, (tx) =>
        createKbVersionFromChunks(tx, ws, {
          number: 99,
          publishedBy: user,
          note: null,
          changedCategories: [],
          scope: { kind: 'draft' },
          keys: [{ sourceId: faq, chunkKey: 'a#0' }],
        }),
      ),
    ).rejects.toThrow();
  });
});
