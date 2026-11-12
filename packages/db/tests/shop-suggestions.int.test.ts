import type { ShopSuggestionInsert } from '@flow/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listShopProfiles } from '../src/queries/kb-content';
import {
  decideShopSuggestion,
  listDraftShopSuggestions,
  replaceShopSuggestionDrafts,
  replaceShopSuggestionDraftsForProfiles,
} from '../src/queries/shop-suggestions';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** KB-SHOP-V2 PR5: đề xuất thông tin shop — hệ thống chèn NHÁP, Owner Áp dụng/Bỏ, không ghi đè lặng lẽ, không lẫn workspace. */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;

const s = (over: Partial<ShopSuggestionInsert> & Pick<ShopSuggestionInsert, 'field' | 'value'>) =>
  ({
    lang: 'vi',
    source: 'shopify',
    sourceRef: 'shop',
    ...over,
  }) as ShopSuggestionInsert;

const drafts = (workspace = ws, user = owner) =>
  db.withActor(workspace, user, (tx) => listDraftShopSuggestions(tx, workspace));
const decide = (id: string, decision: 'applied' | 'rejected', user = owner) =>
  db.withActor(ws, user, (tx) => decideShopSuggestion(tx, ws, id, decision));
const profile = async () => (await db.withActor(ws, owner, (tx) => listShopProfiles(tx, ws)))[0];

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'sugg-owner');
  staff = await seedUser(admin, 'sugg-staff');
  otherOwner = await seedUser(admin, 'sugg-other');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
  await admin.query(
    "INSERT INTO cf.shop_profiles (workspace_id, lang, name, slogan, contact) VALUES ($1, 'vi', 'Shop A', 'Giữ nguyên', 'Gọi shop')",
    [ws],
  );
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('đề xuất thông tin shop', () => {
  it('hệ thống chèn nháp; chạy lại làm mới nháp cũ (không nhân đôi); khác workspace không thấy', async () => {
    const items = [
      s({ field: 'name', value: 'Shop A (Shopify)' }),
      s({
        field: 'hotline',
        value: '0901234567',
        source: 'kb_text',
        evidenceQuote: 'Hotline: 0901234567',
        sourceRef: 'Giới thiệu',
      }),
      s({ field: 'email', value: 'a@shopa.vn' }),
      s({
        field: 'zalo',
        value: 'https://zalo.me/shopa',
        source: 'kb_text',
        evidenceQuote: 'Zalo https://zalo.me/shopa',
      }),
      s({ field: 'website', value: 'https://shopa.vn' }),
      s({
        field: 'slogan',
        value: 'Đẹp mỗi ngày',
        source: 'kb_text',
        evidenceQuote: 'Đẹp mỗi ngày',
      }),
    ];
    expect(await db.withJob(ws, (tx) => replaceShopSuggestionDrafts(tx, ws, items))).toBe(6);
    expect(
      await db.withJob(ws, (tx) =>
        replaceShopSuggestionDrafts(tx, ws, [s({ field: 'name', value: 'Shop A mới' })]),
      ),
    ).toBe(1);
    const list = await drafts();
    expect(list).toHaveLength(6);
    expect(list.find((d) => d.field === 'name')?.value).toBe('Shop A mới');
    expect(list.find((d) => d.field === 'hotline')).toMatchObject({
      source: 'kb_text',
      sourceRef: 'Giới thiệu',
      evidenceQuote: 'Hotline: 0901234567',
    });
    expect(await drafts(other, otherOwner)).toEqual([]);
  });

  it('Owner Áp dụng: ghi đúng cột (tên, website, Zalo vào contacts, hotline/email nối vào liên hệ), đánh dấu applied', async () => {
    const byField = Object.fromEntries((await drafts()).map((d) => [d.field, d.id]));
    expect(await decide(byField.name as string, 'applied')).toBe('applied');
    expect(await decide(byField.website as string, 'applied')).toBe('applied');
    expect(await decide(byField.zalo as string, 'applied')).toBe('applied');
    expect(await decide(byField.hotline as string, 'applied')).toBe('applied');
    expect(await decide(byField.email as string, 'applied')).toBe('applied');
    const p = await profile();
    expect(p).toMatchObject({
      name: 'Shop A mới',
      website: 'https://shopa.vn',
      contacts: { zalo: 'https://zalo.me/shopa' },
      contact: 'Gọi shop; 0901234567; a@shopa.vn',
      slogan: 'Giữ nguyên', // chưa Áp dụng đề xuất khẩu hiệu → không đổi
    });
    const { rows } = await admin.query(
      "SELECT status, decided_by FROM cf.shop_profile_suggestions WHERE workspace_id = $1 AND field = 'name'",
      [ws],
    );
    expect(rows[0]).toMatchObject({ status: 'applied', decided_by: owner });
    expect((await drafts()).map((d) => d.field)).toEqual(['slogan']);
  });

  it('Bỏ: đánh dấu rejected, KHÔNG đổi hồ sơ; Áp dụng lại/Bỏ lại → not_found; Staff không quyết được', async () => {
    const [slogan] = await drafts();
    expect(await decide(slogan?.id as string, 'applied', staff)).toBe('not_found');
    expect(await decide(slogan?.id as string, 'rejected')).toBe('rejected');
    expect((await profile())?.slogan).toBe('Giữ nguyên');
    expect(await decide(slogan?.id as string, 'applied')).toBe('not_found');
    expect(await decide('00000000-0000-4000-8000-000000000000', 'rejected')).toBe('not_found');
  });

  it('không đề xuất lại giá trị đã Bỏ/đã Áp dụng, không đề xuất giá trị trùng hồ sơ hiện có', async () => {
    const again = [
      s({
        field: 'slogan',
        value: 'Đẹp mỗi ngày',
        source: 'kb_text',
        evidenceQuote: 'Đẹp mỗi ngày',
      }), // đã Bỏ
      s({ field: 'name', value: 'Shop A mới' }), // trùng hồ sơ (đã Áp dụng)
      s({ field: 'website', value: 'https://shopa.vn' }), // trùng hồ sơ
      s({
        field: 'hotline',
        value: '0901234567',
        source: 'kb_text',
        evidenceQuote: 'Hotline: 0901234567',
      }), // đã có trong liên hệ
      s({ field: 'description', value: 'Mô tả mới' }), // mới
    ];
    expect(await db.withJob(ws, (tx) => replaceShopSuggestionDrafts(tx, ws, again))).toBe(1);
    expect((await drafts()).map((d) => d.field)).toEqual(['description']);
  });

  it('thiếu hồ sơ cùng ngôn ngữ: chỉ tên tạo được hồ sơ, trường khác trả no_profile; liên hệ quá 200 ký tự trả too_long', async () => {
    await db.withJob(ws, (tx) =>
      replaceShopSuggestionDrafts(tx, ws, [
        s({ lang: 'en', field: 'address', value: '1 Le Loi' }),
        s({ lang: 'en', field: 'name', value: 'Shop A EN' }),
      ]),
    );
    const en = await drafts();
    const addr = en.find((d) => d.lang === 'en' && d.field === 'address');
    const name = en.find((d) => d.lang === 'en' && d.field === 'name');
    expect(await decide(addr?.id as string, 'applied')).toBe('no_profile');
    expect(await decide(name?.id as string, 'applied')).toBe('applied');
    expect(await decide(addr?.id as string, 'applied')).toBe('applied');

    await admin.query(
      "UPDATE cf.shop_profiles SET contact = $2 WHERE workspace_id = $1 AND lang = 'vi'",
      [ws, 'x'.repeat(195)],
    );
    await db.withJob(ws, (tx) =>
      replaceShopSuggestionDrafts(tx, ws, [s({ field: 'email', value: 'b@shopa.vn' })]),
    );
    const email = (await drafts()).find((d) => d.field === 'email');
    expect(await decide(email?.id as string, 'applied')).toBe('too_long');
    expect((await drafts()).some((d) => d.field === 'email')).toBe(true); // vẫn nháp
  });

  it('ForProfiles: nhân đề xuất ra từng ngôn ngữ đã có hồ sơ; workspace chưa có hồ sơ → chỉ vi', async () => {
    const written = await db.withJob(ws, (tx) =>
      replaceShopSuggestionDraftsForProfiles(tx, ws, [
        s({
          field: 'tax_id',
          value: '0312345678',
          source: 'kb_text',
          evidenceQuote: 'MST 0312345678',
        }),
      ]),
    );
    expect(written).toBe(2); // ws có hồ sơ vi và en
    expect(
      (await drafts())
        .filter((d) => d.field === 'tax_id')
        .map((d) => d.lang)
        .sort(),
    ).toEqual(['en', 'vi']);
    expect(
      await db.withJob(other, (tx) =>
        replaceShopSuggestionDraftsForProfiles(tx, other, [s({ field: 'name', value: 'Shop B' })]),
      ),
    ).toBe(1);
    expect((await drafts(other, otherOwner)).map((d) => d.lang)).toEqual(['vi']);
  });
});
