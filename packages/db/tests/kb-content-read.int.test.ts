import { parseBrandVoice, parseFaqItem, parsePolicyItem, parseShopProfile } from '@flow/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createFaqItem,
  createPolicyItem,
  listBrandVoices,
  listFaqItems,
  listPolicyItems,
  listShopProfiles,
  loadKbOverview,
  upsertBrandVoice,
  upsertShopProfile,
} from '../src/queries/kb-content';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** Đọc kiến thức nhập tay cho trang Cơ sở kiến thức: đúng workspace, không lẫn workspace khác. */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let otherOwner: string;

const ok = <T>(r: { success: boolean; data?: T }): T => {
  expect(r.success).toBe(true);
  return r.data as T;
};

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'kbr-owner');
  otherOwner = await seedUser(admin, 'kbr-other');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, other, otherOwner, 'owner');
  await db.withActor(ws, owner, async (tx) => {
    await upsertShopProfile(
      tx,
      ws,
      ok(parseShopProfile({ lang: 'vi', name: 'Shop A', website: 'https://a.vn' })),
    );
    await upsertBrandVoice(
      tx,
      ws,
      ok(
        parseBrandVoice({
          lang: 'vi',
          shopPronoun: 'em',
          customerAddress: 'anh_chi',
          tone: 'thân thiện',
          doRules: ['chào'],
          dontRules: [],
        }),
      ),
    );
    await createFaqItem(
      tx,
      ws,
      ok(
        parseFaqItem({ question: 'Ship bao lâu?', answer: '2-3 ngày', lang: 'vi', tags: ['ship'] }),
      ),
    );
    await createFaqItem(
      tx,
      ws,
      ok(parseFaqItem({ question: 'Có đổi size không?', answer: 'Có', lang: 'all' })),
    );
    await createPolicyItem(
      tx,
      ws,
      ok(parsePolicyItem({ kind: 'return', lang: 'all', title: 'Đổi trả', content: '7 ngày' })),
    );
  });
  await db.withActor(other, otherOwner, async (tx) => {
    await createFaqItem(
      tx,
      other,
      ok(parseFaqItem({ question: 'Của người khác', answer: 'x', lang: 'vi' })),
    );
  });
  await admin.query(
    `INSERT INTO cf.products (workspace_id, name, sku, price_vnd, stock, category) VALUES ($1, 'Váy hoa', 'SKU1', 349000, 42, 'Váy')`,
    [ws],
  );
  await admin.query(
    `INSERT INTO cf.products (workspace_id, name, status) VALUES ($1, 'Đã ngừng', 'archived')`,
    [ws],
  );
  await admin.query(
    `INSERT INTO cf.kb_sources (workspace_id, type, title, origin_url) VALUES ($1, 'url', 'Chính sách đổi trả', 'https://a.vn/doi-tra')`,
    [ws],
  );
  // Dữ liệu MẪU (nhãn [MẪU], do seed dev tạo): trang tổng quan phải bỏ qua, chỉ đếm dữ liệu thật.
  await admin.query(
    `INSERT INTO cf.products (workspace_id, name, sku, price_vnd, stock) VALUES ($1, '[MẪU] Túi tote', 'MAU-1', 1, 1)`,
    [ws],
  );
  await admin.query(
    `INSERT INTO cf.kb_sources (workspace_id, type, title) VALUES ($1, 'faq', '[MẪU] Câu hỏi thường gặp')`,
    [ws],
  );
  await db.withActor(ws, owner, async (tx) => {
    await createFaqItem(
      tx,
      ws,
      ok(parseFaqItem({ question: '[MẪU] Ship bao lâu?', answer: 'mẫu', lang: 'vi' })),
    );
    await createPolicyItem(
      tx,
      ws,
      ok(
        parsePolicyItem({ kind: 'other', lang: 'all', title: '[MẪU] Chính sách', content: 'mẫu' }),
      ),
    );
  });
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('đọc kiến thức nhập tay', () => {
  it('listFaqItems: chỉ của workspace, mới sửa trước, đủ trường', async () => {
    const rows = await db.withActor(ws, owner, (tx) => listFaqItems(tx, ws));
    // Trang nhập tay liệt kê MỌI mục (kể cả mục mẫu có nhãn [MẪU]); chỉ trang tổng quan lọc dữ liệu mẫu.
    expect(rows.map((r) => r.question).sort()).toEqual([
      'Có đổi size không?',
      'Ship bao lâu?',
      '[MẪU] Ship bao lâu?',
    ]);
    const ship = rows.find((r) => r.question === 'Ship bao lâu?');
    expect(ship).toMatchObject({ answer: '2-3 ngày', lang: 'vi', tags: ['ship'] });
    expect(ship?.updatedAt).toBeInstanceOf(Date);
  });

  it('listPolicyItems / listShopProfiles / listBrandVoices', async () => {
    const [policies, profiles, voices] = await db.withActor(
      ws,
      owner,
      async (tx) =>
        [
          await listPolicyItems(tx, ws),
          await listShopProfiles(tx, ws),
          await listBrandVoices(tx, ws),
        ] as const,
    );
    expect(policies).toHaveLength(2);
    expect(policies.find((p) => p.kind === 'return')).toMatchObject({
      lang: 'all',
      title: 'Đổi trả',
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ lang: 'vi', name: 'Shop A', website: 'https://a.vn' });
    expect(voices).toHaveLength(1);
    expect(voices[0]).toMatchObject({
      lang: 'vi',
      tone: 'thân thiện',
      doRules: ['chào'],
      shopPronoun: 'em',
      customerAddress: 'anh_chi',
    });
  });

  it('loadKbOverview: đếm đúng dữ liệu THẬT (bỏ sản phẩm đã lưu trữ và mọi dòng nhãn [MẪU]), nguồn và sản phẩm xem trước', async () => {
    const overview = await db.withActor(ws, owner, (tx) => loadKbOverview(tx, ws));
    expect(overview.counts).toEqual({
      products: 1,
      policies: 1,
      faqs: 2,
      shopProfiles: 1,
      brandVoices: 1,
      sources: 1,
    });
    expect(overview.sources[0]).toMatchObject({ type: 'url', title: 'Chính sách đổi trả' });
    expect(overview.sampleProduct).toMatchObject({
      name: 'Váy hoa',
      sku: 'SKU1',
      priceVnd: 349000,
      stock: 42,
    });
  });

  it('không lẫn workspace khác', async () => {
    const overview = await db.withActor(other, otherOwner, (tx) => loadKbOverview(tx, other));
    expect(overview.counts.faqs).toBe(1);
    expect(overview.counts.products).toBe(0);
    expect(overview.sampleProduct).toBeNull();
  });
});
