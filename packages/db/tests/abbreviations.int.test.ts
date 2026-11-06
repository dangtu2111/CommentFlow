import { parseAbbreviation } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createAbbreviation,
  deleteAbbreviation,
  listAbbreviations,
  listSystemAbbreviations,
  loadAbbreviationEntries,
  updateAbbreviation,
} from '../src/queries/abbreviations';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * ABBREV-DICT (FR-025, FR-050, Q-AD1): từ điển hệ thống (`cf.system_abbreviations`, chỉ đọc) + của workspace
 * (`cf.abbreviations`, Owner ghi, RLS). Dữ liệu mỗi test tự dựng; chỉ đọc seed hệ thống.
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

const entry = (short: string, full: string, lang = 'vi') => {
  const r = parseAbbreviation({ short, full, lang });
  expect(r.success).toBe(true);
  return (r as { data: { short: string; full: string; lang: 'vi' | 'en' } }).data;
};

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

describe('FR-025 từ điển hệ thống', () => {
  it('đã seed các từ phổ biến; mọi workspace thấy cùng một bộ', async () => {
    const a = await db.withActor(ws, owner, (tx) => listSystemAbbreviations(tx, 'vi'));
    const b = await db.withActor(other, otherOwner, (tx) => listSystemAbbreviations(tx, 'vi'));
    const map = Object.fromEntries(a.map((e) => [e.short, e.full]));
    expect(map.ib).toBe('inbox');
    expect(map.sz).toBe('size');
    expect(map.dc).toBe('được');
    expect(map.k).toBe('không');
    expect(b).toEqual(a);
    const en = await db.withActor(ws, owner, (tx) => listSystemAbbreviations(tx, 'en'));
    expect(en.map((e) => e.short)).toContain('thx');
  });

  it('cf_app không ghi được (Owner cũng không): INSERT/UPDATE/DELETE đều bị từ chối', async () => {
    const run = (q: ReturnType<typeof sql>) =>
      expectRejectCode(db.withActor(ws, owner, (tx) => tx.execute(q)));
    expect(
      await run(
        sql`INSERT INTO cf.system_abbreviations (short, "full", lang) VALUES ('zz', 'zzz', 'vi')`,
      ),
    ).toBe(RLS);
    expect(await run(sql`UPDATE cf.system_abbreviations SET "full" = 'x' WHERE short = 'ib'`)).toBe(
      RLS,
    );
    expect(await run(sql`DELETE FROM cf.system_abbreviations WHERE short = 'ib'`)).toBe(RLS);
    const still = await admin.query(
      `SELECT "full" FROM cf.system_abbreviations WHERE short = 'ib' AND lang = 'vi'`,
    );
    expect(still.rows[0].full).toBe('inbox');
  });

  it('seed hợp lệ: short đã chuẩn hóa, không trùng, không mục nào tự ánh xạ chính nó', async () => {
    const r = await admin.query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE short <> lower(short) OR short ~ '\\s' OR short = lower("full"))::int AS bad
       FROM cf.system_abbreviations`,
    );
    expect(r.rows[0].n).toBeGreaterThan(30);
    expect(r.rows[0].bad).toBe(0);
  });
});

describe('FR-050 Owner ghi từ điển workspace', () => {
  it('Owner tạo/sửa/xóa; id lạ trả false', async () => {
    const id = await db.withActor(ws, owner, (tx) =>
      createAbbreviation(tx, ws, entry('cod', 'thanh toán khi nhận hàng')),
    );
    expect(
      await db.withActor(ws, owner, (tx) =>
        updateAbbreviation(tx, ws, id, entry('cod', 'giao hàng thu tiền')),
      ),
    ).toBe(true);
    const list = await db.withActor(ws, owner, (tx) => listAbbreviations(tx, ws, 'vi'));
    expect(list.find((e) => e.id === id)?.full).toBe('giao hàng thu tiền');
    expect(await db.withActor(ws, owner, (tx) => deleteAbbreviation(tx, ws, id))).toBe(true);
    expect(await db.withActor(ws, owner, (tx) => deleteAbbreviation(tx, ws, id))).toBe(false);
  });

  it('hệ thống (withJob) ghi được', async () => {
    const id = await db.withJob(ws, (tx) => createAbbreviation(tx, ws, entry('job1', 'từ job')));
    expect(id).toMatch(/[0-9a-f-]{36}/);
  });

  it('trùng (workspace, lang, short) → 23505; cùng short khác ngôn ngữ thì được', async () => {
    await db.withActor(ws, owner, (tx) => createAbbreviation(tx, ws, entry('dup', 'một')));
    expect(
      await expectRejectCode(
        db.withActor(ws, owner, (tx) => createAbbreviation(tx, ws, entry('dup', 'hai'))),
      ),
    ).toBe(UNIQUE);
    await db.withActor(ws, owner, (tx) => createAbbreviation(tx, ws, entry('dup', 'one', 'en')));
  });

  it('CHECK chặn short có chữ hoa/khoảng trắng và full rỗng (bỏ qua bước parse)', async () => {
    const bad = (short: string, full: string) =>
      expectRejectCode(
        db.withActor(ws, owner, (tx) =>
          tx.execute(
            sql`INSERT INTO cf.abbreviations (workspace_id, short, "full", lang) VALUES (${ws}::uuid, ${short}, ${full}, 'vi')`,
          ),
        ),
      );
    expect(await bad('HOA', 'x')).toBe(CHECK);
    expect(await bad('a b', 'x')).toBe(CHECK);
    expect(await bad('ok1', '')).toBe(CHECK);
  });

  it('không đổi được workspace_id/lang (không có quyền cột)', async () => {
    const id = await db.withActor(ws, owner, (tx) =>
      createAbbreviation(tx, ws, entry('lck', 'khóa')),
    );
    expect(
      await expectRejectCode(
        db.withActor(ws, owner, (tx) =>
          tx.execute(sql`UPDATE cf.abbreviations SET lang = 'en' WHERE id = ${id}::uuid`),
        ),
      ),
    ).toBe(RLS);
    expect(
      await expectRejectCode(
        db.withActor(ws, owner, (tx) =>
          tx.execute(
            sql`UPDATE cf.abbreviations SET workspace_id = ${other}::uuid WHERE id = ${id}::uuid`,
          ),
        ),
      ),
    ).toBe(RLS);
  });
});

describe('FR-050 RLS: vai trò và chéo workspace', () => {
  it('Staff đọc được nhưng không ghi được; người lạ không thấy gì', async () => {
    const id = await db.withActor(ws, owner, (tx) =>
      createAbbreviation(tx, ws, entry('stf', 'cho staff đọc')),
    );
    const seen = await db.withActor(ws, staff, (tx) => listAbbreviations(tx, ws, 'vi'));
    expect(seen.map((e) => e.id)).toContain(id);
    expect(
      await expectRejectCode(
        db.withActor(ws, staff, (tx) => createAbbreviation(tx, ws, entry('stf2', 'x'))),
      ),
    ).toBe(RLS);
    expect(
      await db.withActor(ws, staff, (tx) => updateAbbreviation(tx, ws, id, entry('stf', 'sửa'))),
    ).toBe(false);
    expect(await db.withActor(ws, staff, (tx) => deleteAbbreviation(tx, ws, id))).toBe(false);
    expect(await db.withActor(ws, stranger, (tx) => listAbbreviations(tx, ws))).toHaveLength(0);
  });

  it('withWorkspace trần chỉ đọc (fail-closed khi quên withActor)', async () => {
    expect(
      await expectRejectCode(
        db.withWorkspace(ws, (tx) => createAbbreviation(tx, ws, entry('bare', 'x'))),
      ),
    ).toBe(RLS);
    const r = await db.withWorkspace(ws, (tx) => listAbbreviations(tx, ws));
    expect(r.length).toBeGreaterThan(0);
  });

  it('workspace B không thấy, không sửa/xóa, không ghi vào workspace A', async () => {
    const id = await db.withActor(ws, owner, (tx) =>
      createAbbreviation(tx, ws, entry('riengA', 'riêng của A')),
    );
    const seen = await db.withActor(other, otherOwner, (tx) =>
      tx.execute(sql`SELECT id FROM cf.abbreviations WHERE id = ${id}::uuid`),
    );
    expect(seen.rows).toHaveLength(0);
    expect(await db.withActor(other, otherOwner, (tx) => deleteAbbreviation(tx, other, id))).toBe(
      false,
    );
    expect(
      await db.withActor(other, otherOwner, (tx) =>
        updateAbbreviation(tx, other, id, entry('riengA', 'chiếm')),
      ),
    ).toBe(false);
    expect(
      await expectRejectCode(
        db.withActor(other, otherOwner, (tx) =>
          createAbbreviation(tx, ws, entry('chen', 'chèn chéo')),
        ),
      ),
    ).toBe(RLS);
    const still = await admin.query('SELECT "full" FROM cf.abbreviations WHERE id = $1', [id]);
    expect(still.rows[0].full).toBe('riêng của A');
  });
});

describe('FR-025 loadAbbreviationEntries', () => {
  it('trộn hệ thống + workspace: mục của shop đè; đúng ngôn ngữ; không lẫn workspace khác', async () => {
    await db.withActor(ws, owner, (tx) => createAbbreviation(tx, ws, entry('ib', 'nhắn riêng')));
    await db.withActor(ws, owner, (tx) => createAbbreviation(tx, ws, entry('shopA', 'cửa hàng A')));
    await db.withActor(other, otherOwner, (tx) =>
      createAbbreviation(tx, other, entry('shopB', 'cửa hàng B')),
    );
    const vi = await db.withWorkspace(ws, (tx) => loadAbbreviationEntries(tx, ws, 'vi'));
    expect(vi.ib).toBe('nhắn riêng');
    expect(vi.sz).toBe('size');
    expect(vi.shopA).toBe('cửa hàng A');
    expect(vi.shopB).toBeUndefined();
    expect(vi.thx).toBeUndefined();
    const en = await db.withWorkspace(ws, (tx) => loadAbbreviationEntries(tx, ws, 'en'));
    expect(en.thx).toBe('thanks');
    expect(en.ib).toBeUndefined();
    const otherVi = await db.withWorkspace(other, (tx) => loadAbbreviationEntries(tx, other, 'vi'));
    expect(otherVi.ib).toBe('inbox');
    expect(otherVi.shopA).toBeUndefined();
  });
});
