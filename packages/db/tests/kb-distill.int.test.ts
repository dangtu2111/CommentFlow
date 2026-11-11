import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listFaqItems } from '../src/queries/kb-content';
import {
  approveDraftFaq,
  countDraftFaqs,
  insertDistilledFaqDrafts,
  listChunksToDistill,
  listDraftFaqs,
  markChunksDistilled,
  rejectDraftFaq,
} from '../src/queries/kb-distill';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/** M3-2a: các thao tác DB của bước chắt lọc — nháp không vào danh sách đã duyệt, chỉ Owner duyệt/từ chối, đoạn chỉ chắt lọc một lần mỗi bản nội dung. */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let owner: string;
let staff: string;
let chunkId: string;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin, 'distill-owner');
  staff = await seedUser(admin, 'distill-staff');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  const manual = (
    await admin.query(
      `INSERT INTO cf.kb_sources (workspace_id, type, title, external_key) VALUES ($1, 'manual', 'Thông tin shop', 'sync:shop') RETURNING id`,
      [ws],
    )
  ).rows[0].id as string;
  const faqSource = (
    await admin.query(
      `INSERT INTO cf.kb_sources (workspace_id, type, title, external_key) VALUES ($1, 'faq', 'FAQ', 'sync:faq') RETURNING id`,
      [ws],
    )
  ).rows[0].id as string;
  const chunk = (source: string, key: string, hash: string, suspected = false) =>
    admin.query(
      `INSERT INTO cf.kb_chunks (workspace_id, source_id, chunk_key, content, lang, content_hash, is_draft, injection_suspected)
       VALUES ($1, $2, $3, 'Áo cotton 100%', 'vi', $4, true, $5) RETURNING id`,
      [ws, source, key, hash, suspected],
    );
  chunkId = (await chunk(manual, 'shop:vi#0', 'hash-1')).rows[0].id as string;
  await chunk(manual, 'shop:vi#1', 'hash-sus', true);
  await chunk(faqSource, 'faq:1#0', 'hash-faq');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

const draft = (question: string) => ({
  kind: 'faq' as const,
  question,
  answer: 'Cotton 100%',
  lang: 'vi' as const,
  evidenceQuote: 'Áo cotton 100%',
  sourceChunkId: chunkId,
});

describe('chắt lọc: chọn đoạn và đánh dấu', () => {
  it('chỉ đoạn không nghi cài lệnh và không phải FAQ; đánh dấu rồi không chọn lại; đổi nội dung → chọn lại', async () => {
    const first = await db.withJob(ws, (tx) => listChunksToDistill(tx, ws, 10));
    expect(first.map((c) => c.id)).toEqual([chunkId]);
    await db.withJob(ws, (tx) => markChunksDistilled(tx, ws, first));
    expect(await db.withJob(ws, (tx) => listChunksToDistill(tx, ws, 10))).toEqual([]);
    await admin.query(`UPDATE cf.kb_chunks SET content_hash = 'hash-2' WHERE id = $1`, [chunkId]);
    expect(
      (await db.withJob(ws, (tx) => listChunksToDistill(tx, ws, 10))).map((c) => c.id),
    ).toEqual([chunkId]);
  });
});

describe('chắt lọc: nháp FAQ', () => {
  it('chèn nháp, bỏ trùng câu hỏi (không phân biệt hoa thường); nháp không vào danh sách đã duyệt', async () => {
    const n = await db.withJob(ws, (tx) =>
      insertDistilledFaqDrafts(tx, ws, [draft('Chất liệu gì?'), draft('CHẤT LIỆU GÌ?')]),
    );
    expect(n).toBe(1);
    expect(
      await db.withJob(ws, (tx) => insertDistilledFaqDrafts(tx, ws, [draft('chất liệu gì?')])),
    ).toBe(0);
    expect(await db.withActor(ws, owner, (tx) => countDraftFaqs(tx, ws))).toBe(1);
    expect(await db.withActor(ws, owner, (tx) => listFaqItems(tx, ws))).toEqual([]);
    const rows = await db.withActor(ws, owner, (tx) => listDraftFaqs(tx, ws));
    expect(rows[0]).toMatchObject({ kind: 'faq', evidenceQuote: 'Áo cotton 100%' });
  });

  it('Owner duyệt → vào danh sách đã duyệt; staff và job hệ thống không duyệt được', async () => {
    await db.withJob(ws, (tx) => insertDistilledFaqDrafts(tx, ws, [draft('Giặt thế nào?')]));
    const id = (await db.withActor(ws, owner, (tx) => listDraftFaqs(tx, ws))).find(
      (r) => r.question === 'Giặt thế nào?',
    )?.id as string;
    // Staff: RLS không cho thấy quyền ghi → 0 dòng đổi. Job hệ thống: trigger chặn draft → published (42501).
    expect(await db.withActor(ws, staff, (tx) => approveDraftFaq(tx, ws, id))).toBe(false);
    expect(await expectRejectCode(db.withJob(ws, (tx) => approveDraftFaq(tx, ws, id)))).toBe(
      '42501',
    );
    expect(await db.withActor(ws, owner, (tx) => approveDraftFaq(tx, ws, id))).toBe(true);
    expect(await db.withActor(ws, owner, (tx) => approveDraftFaq(tx, ws, id))).toBe(false);
    const published = await db.withActor(ws, owner, (tx) => listFaqItems(tx, ws));
    expect(published.map((f) => f.question)).toEqual(['Giặt thế nào?']);
  });

  it('Owner từ chối → xóa nháp; không xóa được mục đã duyệt bằng đường này', async () => {
    await db.withJob(ws, (tx) => insertDistilledFaqDrafts(tx, ws, [draft('Xuất xứ ở đâu?')]));
    const rows = await db.withActor(ws, owner, (tx) => listDraftFaqs(tx, ws));
    const id = rows.find((r) => r.question === 'Xuất xứ ở đâu?')?.id as string;
    expect(await db.withActor(ws, owner, (tx) => rejectDraftFaq(tx, ws, id))).toBe(true);
    const published = (await db.withActor(ws, owner, (tx) => listFaqItems(tx, ws)))[0]
      ?.id as string;
    expect(await db.withActor(ws, owner, (tx) => rejectDraftFaq(tx, ws, published))).toBe(false);
    const left = await db.withActor(ws, owner, (tx) =>
      tx.execute(sql`SELECT count(*)::int AS n FROM cf.faq_items WHERE id = ${published}::uuid`),
    );
    expect(left.rows[0]).toMatchObject({ n: 1 });
  });
});
