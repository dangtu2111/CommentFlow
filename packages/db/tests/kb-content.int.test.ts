import { parseBrandVoice, parseFaqItem, parsePolicyItem, parseShopProfile } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createFaqItem,
  createPolicyItem,
  deleteFaqItem,
  deletePolicyItem,
  updateFaqItem,
  updatePolicyItem,
  upsertBrandVoice,
  upsertShopProfile,
} from '../src/queries/kb-content';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * KB-SHOP-POLICY-FAQ (FR-050, FR-142, QKB2): shop_profiles / policy_items / faq_items / brand_voice.
 * Ghi: Owner đang hoạt động hoặc hệ thống; Staff, người lạ, withWorkspace trần chỉ đọc (hoặc không thấy).
 */
const RLS = '42501';
const CHECK = '23514';
const UNIQUE = '23505';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let stranger: string;
let otherOwner: string;

const ok = <T>(r: { success: boolean; data?: T }): T => {
  expect(r.success).toBe(true);
  return r.data as T;
};
const profile = (lang = 'vi', name = 'Shop A') => ok(parseShopProfile({ lang, name }));
const voice = (lang = 'vi') =>
  ok(
    parseBrandVoice(
      lang === 'vi'
        ? { lang, shopPronoun: 'em', customerAddress: 'anh_chi' }
        : { lang, shopPronoun: 'shop', customerAddress: 'you' },
    ),
  );
const faq = (q = 'Ship bao lâu?') =>
  ok(parseFaqItem({ question: q, answer: '2-3 ngày', lang: 'vi' }));
const policy = () =>
  ok(parsePolicyItem({ kind: 'return', lang: 'all', title: 'Đổi trả', content: '7 ngày' }));

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'owner');
  staff = await seedUser(admin, 'staff');
  stranger = await seedUser(admin, 'stranger');
  otherOwner = await seedUser(admin, 'otherOwner');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-050 Owner ghi, vòng đời', () => {
  it('Owner upsert hồ sơ shop và giọng văn (lần hai là cập nhật, không trùng)', async () => {
    await db.withActor(ws, owner, (tx) => upsertShopProfile(tx, ws, profile()));
    await db.withActor(ws, owner, (tx) => upsertShopProfile(tx, ws, profile('vi', 'Shop A mới')));
    await db.withActor(ws, owner, (tx) => upsertBrandVoice(tx, ws, voice()));
    await db.withActor(ws, owner, (tx) => upsertBrandVoice(tx, ws, voice()));
    const r = await admin.query('SELECT name FROM cf.shop_profiles WHERE workspace_id = $1', [ws]);
    expect(r.rows).toEqual([{ name: 'Shop A mới' }]);
    const v = await admin.query(
      'SELECT count(*)::int AS n FROM cf.brand_voice WHERE workspace_id = $1',
      [ws],
    );
    expect(v.rows[0].n).toBe(1);
  });

  it('Owner tạo/sửa/xóa FAQ và chính sách; id lạ trả false', async () => {
    const id = await db.withActor(ws, owner, (tx) => createFaqItem(tx, ws, faq()));
    expect(await db.withActor(ws, owner, (tx) => updateFaqItem(tx, ws, id, faq('Đổi trả?')))).toBe(
      true,
    );
    expect(await db.withActor(ws, owner, (tx) => deleteFaqItem(tx, ws, id))).toBe(true);
    expect(await db.withActor(ws, owner, (tx) => deleteFaqItem(tx, ws, id))).toBe(false);
    const pid = await db.withActor(ws, owner, (tx) => createPolicyItem(tx, ws, policy()));
    expect(
      await db.withActor(ws, owner, (tx) =>
        updatePolicyItem(tx, ws, pid, { title: 'Mới', content: '14 ngày' }),
      ),
    ).toBe(true);
    expect(await db.withActor(ws, owner, (tx) => deletePolicyItem(tx, ws, pid))).toBe(true);
  });

  it('hệ thống (withJob) ghi được', async () => {
    const id = await db.withJob(ws, (tx) => createFaqItem(tx, ws, faq('Từ job?')));
    expect(id).toMatch(/[0-9a-f-]{36}/);
  });
});

describe('FR-050 RLS: vai trò và chéo workspace', () => {
  it('Staff đọc được nhưng không ghi được; người lạ không thấy gì', async () => {
    await db.withActor(ws, owner, (tx) => createFaqItem(tx, ws, faq('Cho Staff đọc')));
    const seen = await db.withActor(ws, staff, (tx) =>
      tx.execute(sql`SELECT id FROM cf.faq_items`),
    );
    expect(seen.rows.length).toBeGreaterThan(0);
    expect(
      await expectRejectCode(db.withActor(ws, staff, (tx) => createFaqItem(tx, ws, faq()))),
    ).toBe(RLS);
    expect(
      await expectRejectCode(db.withActor(ws, staff, (tx) => upsertBrandVoice(tx, ws, voice()))),
    ).toBe(RLS);
    expect(
      await db.withActor(ws, staff, (tx) =>
        deleteFaqItem(tx, ws, '00000000-0000-4000-8000-000000000000'),
      ),
    ).toBe(false);
    const none = await db.withActor(ws, stranger, (tx) =>
      tx.execute(sql`SELECT id FROM cf.faq_items`),
    );
    expect(none.rows).toHaveLength(0);
  });

  it('withWorkspace trần chỉ đọc (fail-closed khi quên withActor)', async () => {
    expect(await expectRejectCode(db.withWorkspace(ws, (tx) => createFaqItem(tx, ws, faq())))).toBe(
      RLS,
    );
    const r = await db.withWorkspace(ws, (tx) => tx.execute(sql`SELECT id FROM cf.faq_items`));
    expect(r.rows.length).toBeGreaterThan(0);
  });

  it('workspace B không thấy, không sửa/xóa, không ghi vào workspace A', async () => {
    const id = await db.withActor(ws, owner, (tx) => createFaqItem(tx, ws, faq('Riêng A')));
    const seen = await db.withActor(other, otherOwner, (tx) =>
      tx.execute(sql`SELECT id FROM cf.faq_items WHERE id = ${id}::uuid`),
    );
    expect(seen.rows).toHaveLength(0);
    expect(await db.withActor(other, otherOwner, (tx) => deleteFaqItem(tx, other, id))).toBe(false);
    expect(
      await db.withActor(other, otherOwner, (tx) => updateFaqItem(tx, other, id, faq('Chiếm'))),
    ).toBe(false);
    expect(
      await expectRejectCode(
        db.withActor(other, otherOwner, (tx) => createFaqItem(tx, ws, faq('Chèn chéo'))),
      ),
    ).toBe(RLS);
    const still = await admin.query('SELECT question FROM cf.faq_items WHERE id = $1', [id]);
    expect(still.rows[0].question).toBe('Riêng A');
  });

  it('shop_profiles và brand_voice không có DELETE cho cf_app', async () => {
    const r = await admin.query(
      `SELECT has_table_privilege('cf_app', 'cf.shop_profiles', 'DELETE') AS a,
              has_table_privilege('cf_app', 'cf.brand_voice', 'DELETE') AS b`,
    );
    expect(r.rows[0]).toEqual({ a: false, b: false });
  });
});

describe('FR-050 ràng buộc dữ liệu', () => {
  it('(workspace, lang) duy nhất cho hồ sơ shop và giọng văn', async () => {
    expect(
      await expectRejectCode(
        admin.query(
          "INSERT INTO cf.shop_profiles (workspace_id, lang, name) VALUES ($1, 'vi', 'Trùng')",
          [ws],
        ),
      ),
    ).toBe(UNIQUE);
    expect(
      await expectRejectCode(
        admin.query("INSERT INTO cf.brand_voice (workspace_id, lang) VALUES ($1, 'vi')", [ws]),
      ),
    ).toBe(UNIQUE);
  });

  it('CHECK: lang, kind, xưng hô sai ngôn ngữ, "custom" thiếu tên, nội dung quá dài', async () => {
    const bad = (text: string, params: unknown[]) => expectRejectCode(admin.query(text, params));
    expect(
      await bad(
        "INSERT INTO cf.faq_items (workspace_id, question, answer, lang) VALUES ($1, 'q', 'a', 'fr')",
        [ws],
      ),
    ).toBe(CHECK);
    expect(
      await bad(
        "INSERT INTO cf.policy_items (workspace_id, kind, lang, title, content) VALUES ($1, 'x', 'vi', 't', 'c')",
        [ws],
      ),
    ).toBe(CHECK);
    expect(
      await bad(
        "INSERT INTO cf.policy_items (workspace_id, kind, lang, title, content) VALUES ($1, 'return', 'vi', 't', repeat('x', 8001))",
        [ws],
      ),
    ).toBe(CHECK);
    expect(
      await bad(
        "INSERT INTO cf.brand_voice (workspace_id, lang, customer_address) VALUES ($1, 'en', 'anh_chi')",
        [ws],
      ),
    ).toBe(CHECK);
    expect(
      await bad(
        "INSERT INTO cf.brand_voice (workspace_id, lang, shop_pronoun) VALUES ($1, 'en', 'custom')",
        [ws],
      ),
    ).toBe(CHECK);
  });
});
