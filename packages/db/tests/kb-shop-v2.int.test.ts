import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * Migration 0085 (KB-SHOP-V2, chỉ thêm): cột mới của `shop_profiles` có CHECK giới hạn; bảng `shop_profile_suggestions`: thành viên đọc, Owner ghi,
 * hệ thống CHỈ chèn/sửa NHÁP, chỉ Owner áp dụng/bỏ (trigger đóng dấu người quyết định), nguồn kb_text bắt buộc trích dẫn, workspace khác không thấy.
 */
const RLS = '42501';
const CHECK = '23514';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'shop-v2-owner');
  staff = await seedUser(admin, 'shop-v2-staff');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await admin.query(
    "INSERT INTO cf.shop_profiles (workspace_id, lang, name) VALUES ($1, 'vi', 'Shop A')",
    [ws],
  );
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

const updateProfile = (set: ReturnType<typeof sql>) =>
  db.withActor(ws, owner, (tx) =>
    tx.execute(sql`UPDATE cf.shop_profiles SET ${set} WHERE workspace_id = ${ws}::uuid`),
  );

describe('shop_profiles: cột mới', () => {
  it('mặc định: industries rỗng, branches []; Owner ghi được các cột mới', async () => {
    const row = (
      await admin.query(
        'SELECT industries, branches, slogan FROM cf.shop_profiles WHERE workspace_id = $1',
        [ws],
      )
    ).rows[0];
    expect(row).toEqual({ industries: [], branches: [], slogan: null });
    await updateProfile(
      sql`slogan = 'Thời trang tối giản', industries = ARRAY['Thời trang nữ'], legal_name = 'Hộ kinh doanh A', tax_id = '0316892410',
          hours = '{"open":{"days":[1,2,3],"from":"08:30","to":"21:30"}}'::jsonb,
          contacts = '{"hotline":"1900 6868"}'::jsonb,
          branches = '[{"name":"CN1","address":"1 Nguyễn Trãi","is_main":true}]'::jsonb`,
    );
    const saved = (
      await admin.query(
        'SELECT slogan, industries, jsonb_array_length(branches) AS n FROM cf.shop_profiles WHERE workspace_id = $1',
        [ws],
      )
    ).rows[0];
    expect(saved).toEqual({ slogan: 'Thời trang tối giản', industries: ['Thời trang nữ'], n: 1 });
  });

  it('CHECK: quá 10 chi nhánh, mảng/đối tượng sai kiểu, slogan > 500, quá 10 ngành bị chặn', async () => {
    const tooMany = JSON.stringify(
      Array.from({ length: 11 }, () => ({ name: 'x', address: 'y', is_main: false })),
    );
    const bads = [
      sql`branches = ${tooMany}::jsonb`,
      sql`branches = '{"a":1}'::jsonb`,
      sql`hours = '[1]'::jsonb`,
      sql`contacts = '"x"'::jsonb`,
      sql`slogan = ${'a'.repeat(501)}`,
      sql`industries = ARRAY['1','2','3','4','5','6','7','8','9','10','11']`,
    ];
    for (const set of bads) expect(await expectRejectCode(updateProfile(set))).toBe(CHECK);
  });

  it('Staff không ghi các cột mới (RLS lọc hàng: không lỗi nhưng không đổi gì)', async () => {
    await db.withActor(ws, staff, (tx) =>
      tx.execute(sql`UPDATE cf.shop_profiles SET slogan = 'x' WHERE workspace_id = ${ws}::uuid`),
    );
    const row = (
      await admin.query('SELECT slogan FROM cf.shop_profiles WHERE workspace_id = $1', [ws])
    ).rows[0];
    expect(row.slogan).toBe('Thời trang tối giản');
  });
});

const insertDraft = (
  over: {
    source?: string;
    evidence?: string | null;
    field?: string;
    lang?: string;
    value?: string;
  } = {},
) =>
  db.withJob(ws, (tx) =>
    tx.execute<{ id: string }>(sql`
      INSERT INTO cf.shop_profile_suggestions (workspace_id, lang, field, value, evidence_quote, source, status)
      VALUES (${ws}::uuid, ${over.lang ?? 'vi'}, ${over.field ?? 'zalo'}, ${over.value ?? 'https://zalo.me/shop'},
              ${over.evidence ?? null}, ${over.source ?? 'shopify'}, 'draft')
      RETURNING id`),
  );

describe('shop_profile_suggestions', () => {
  it('hệ thống chèn được NHÁP; không chèn được applied; kb_text bắt buộc trích dẫn; giá trị > 500 / trống / trường lạ bị CHECK', async () => {
    const id = (await insertDraft({ field: 'hotline', value: '1900 6868' })).rows[0]?.id as string;
    expect(id).toBeTruthy();
    expect(
      await expectRejectCode(
        db.withJob(ws, (tx) =>
          tx.execute(sql`
            INSERT INTO cf.shop_profile_suggestions (workspace_id, lang, field, value, source, status)
            VALUES (${ws}::uuid, 'vi', 'email', 'a@b.vn', 'shopify', 'applied')`),
        ),
      ),
    ).toBe(RLS);
    expect(await expectRejectCode(insertDraft({ field: 'email', source: 'kb_text' }))).toBe(CHECK);
    expect(
      (await insertDraft({ field: 'email', source: 'kb_text', evidence: 'Email: a@b.vn' })).rows,
    ).toHaveLength(1);
    expect(await expectRejectCode(insertDraft({ field: 'website', value: 'a'.repeat(501) }))).toBe(
      CHECK,
    );
    expect(await expectRejectCode(insertDraft({ field: 'website', value: '' }))).toBe(CHECK);
    expect(await expectRejectCode(insertDraft({ field: 'price' }))).toBe(CHECK);
  });

  it('mỗi (workspace, lang, field, source) chỉ MỘT nháp', async () => {
    await insertDraft({ field: 'tiktok', value: 'tiktok.com/@a' });
    expect(await expectRejectCode(insertDraft({ field: 'tiktok', value: 'tiktok.com/@b' }))).toBe(
      '23505',
    );
  });

  it('Staff đọc được nhưng không ghi; workspace khác không thấy', async () => {
    const seen = await db.withActor(ws, staff, (tx) =>
      tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM cf.shop_profile_suggestions`),
    );
    expect(Number(seen.rows[0]?.n)).toBeGreaterThan(0);
    expect(
      await expectRejectCode(
        db.withActor(ws, staff, (tx) =>
          tx.execute(sql`
            INSERT INTO cf.shop_profile_suggestions (workspace_id, lang, field, value, source, status)
            VALUES (${ws}::uuid, 'vi', 'shopee', 's', 'shopify', 'draft')`),
        ),
      ),
    ).toBe(RLS);
    const foreign = await db.withWorkspace(other, (tx) =>
      tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM cf.shop_profile_suggestions`),
    );
    expect(Number(foreign.rows[0]?.n)).toBe(0);
  });

  it('chỉ Owner áp dụng/bỏ: hệ thống và Staff bị chặn; Owner thành công và máy chủ đóng dấu decided_by/decided_at', async () => {
    const id = (await insertDraft({ field: 'zalo', lang: 'en', value: 'https://zalo.me/en' }))
      .rows[0]?.id as string;
    const apply = sql`UPDATE cf.shop_profile_suggestions SET status = 'applied' WHERE id = ${id}::uuid`;
    expect(await expectRejectCode(db.withJob(ws, (tx) => tx.execute(apply)))).toBeTruthy();
    await db.withActor(ws, staff, (tx) => tx.execute(apply)); // RLS lọc hàng: không đổi gì
    expect(
      (await admin.query('SELECT status FROM cf.shop_profile_suggestions WHERE id = $1', [id]))
        .rows[0].status,
    ).toBe('draft');
    await db.withActor(ws, owner, (tx) => tx.execute(apply));
    const row = (
      await admin.query(
        'SELECT status, decided_by, decided_at FROM cf.shop_profile_suggestions WHERE id = $1',
        [id],
      )
    ).rows[0];
    expect(row.status).toBe('applied');
    expect(row.decided_by).toBe(owner);
    expect(row.decided_at).toBeInstanceOf(Date);
  });

  it('không đổi được workspace/lang/field/source; hệ thống làm mới giá trị của NHÁP nhưng không đụng bản đã quyết', async () => {
    const id = (await insertDraft({ field: 'website', value: 'https://a.vn' })).rows[0]
      ?.id as string;
    expect(
      await expectRejectCode(
        db.withActor(ws, owner, (tx) =>
          tx.execute(
            sql`UPDATE cf.shop_profile_suggestions SET field = 'zalo' WHERE id = ${id}::uuid`,
          ),
        ),
      ),
    ).toBeTruthy();
    await db.withJob(ws, (tx) =>
      tx.execute(
        sql`UPDATE cf.shop_profile_suggestions SET value = 'https://b.vn' WHERE id = ${id}::uuid`,
      ),
    );
    await db.withActor(ws, owner, (tx) =>
      tx.execute(
        sql`UPDATE cf.shop_profile_suggestions SET status = 'rejected' WHERE id = ${id}::uuid`,
      ),
    );
    await db.withJob(ws, (tx) =>
      tx.execute(
        sql`UPDATE cf.shop_profile_suggestions SET value = 'https://c.vn' WHERE id = ${id}::uuid`,
      ),
    );
    expect(
      (
        await admin.query('SELECT value, status FROM cf.shop_profile_suggestions WHERE id = $1', [
          id,
        ])
      ).rows[0],
    ).toEqual({ value: 'https://b.vn', status: 'rejected' });
  });
});
