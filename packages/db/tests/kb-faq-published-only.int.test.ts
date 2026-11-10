import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listFaqItems, loadKbOverview } from '../src/queries/kb-content';
import { loadReadinessSource } from '../src/queries/readiness';
import { loadTryShopTexts } from '../src/queries/try-products';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** M3-1: nháp chắt lọc (`faq_items.status = 'draft'`) KHÔNG lọt vào danh sách FAQ, đếm tổng quan, độ sẵn sàng, văn bản cho AI thử. */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let owner: string;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  owner = await seedUser(admin, 'faq-pub-owner');
  await seedMember(admin, ws, owner, 'owner');
  await admin.query(
    `INSERT INTO cf.faq_items (workspace_id, question, answer, lang, status) VALUES
       ($1, 'Câu đã duyệt', 'Trả lời đã duyệt', 'vi', 'published'),
       ($1, 'Câu nháp', 'Trả lời nháp', 'vi', 'draft')`,
    [ws],
  );
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FAQ nháp không lọt vào các đường đọc', () => {
  it('danh sách FAQ + tổng quan chỉ có mục đã duyệt', async () => {
    const list = await db.withActor(ws, owner, (tx) => listFaqItems(tx, ws));
    expect(list.map((f) => f.question)).toEqual(['Câu đã duyệt']);
    const overview = await db.withActor(ws, owner, (tx) => loadKbOverview(tx, ws));
    expect(overview.counts.faqs).toBe(1);
  });

  it('độ sẵn sàng và văn bản AI thử chỉ có mục đã duyệt', async () => {
    const readiness = await db.withActor(ws, owner, (tx) => loadReadinessSource(tx, ws));
    expect(readiness.faqs.map((f) => f.question)).toEqual(['Câu đã duyệt']);
    const texts = await db.withActor(ws, owner, (tx) => loadTryShopTexts(tx, ws, '[MẪU]'));
    const faqTexts = texts.filter((t) => t.title.includes('Câu'));
    expect(faqTexts.map((t) => t.title)).toEqual(['Câu đã duyệt']);
  });
});
