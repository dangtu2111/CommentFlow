import { parseShopProfile, type ShopProfileV2 } from '@flow/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { listShopProfiles, upsertShopProfile } from '../src/queries/kb-content';
import { loadReadinessSource } from '../src/queries/readiness';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/** KB-SHOP-V2 PR4: lưu/đọc trường mới của thông tin shop (Owner, `withActor`), không lẫn workspace khác. */
let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let otherOwner: string;
let staff: string;

const base = () => {
  const r = parseShopProfile({ lang: 'vi', name: 'Shop V2' });
  if (!r.success) throw new Error('hồ sơ cơ bản không hợp lệ');
  return r.data;
};

const V2: ShopProfileV2 = {
  slogan: 'Đẹp mỗi ngày',
  industries: ['Thời trang'],
  legalName: 'Công ty TNHH V2',
  taxId: '0312345678',
  hours: {
    open: { days: [1, 2, 3], from: '08:00', to: '21:00' },
    support: { from: '08:00', to: '22:00' },
  },
  contacts: { zalo: 'zalo.me/v2', shopee: 'shopee.vn/v2' },
  branches: [
    { name: 'Trụ sở', address: '1 Lê Lợi', is_main: true },
    { name: 'Cơ sở 2', address: '2 Hai Bà Trưng', hours: '9-18h', is_main: false },
  ],
};

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'sv2-owner');
  otherOwner = await seedUser(admin, 'sv2-other');
  staff = await seedUser(admin, 'sv2-staff');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, other, otherOwner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('thông tin shop v2: lưu và đọc', () => {
  it('Owner lưu đủ trường mới → đọc lại đúng (JSON đi qua Zod, mảng ngành, chi nhánh)', async () => {
    await db.withActor(ws, owner, (tx) => upsertShopProfile(tx, ws, base(), V2));
    const [row] = await db.withActor(ws, owner, (tx) => listShopProfiles(tx, ws));
    expect(row).toMatchObject({
      lang: 'vi',
      name: 'Shop V2',
      slogan: 'Đẹp mỗi ngày',
      industries: ['Thời trang'],
      legalName: 'Công ty TNHH V2',
      taxId: '0312345678',
      hours: V2.hours,
      contacts: V2.contacts,
      branches: V2.branches,
    });
  });

  it('lưu không kèm v2 (đường cũ) thì GIỮ NGUYÊN trường mới; kèm v2 rỗng thì xóa', async () => {
    await db.withActor(ws, owner, (tx) =>
      upsertShopProfile(tx, ws, { ...base(), name: 'Shop V2 đổi tên' }),
    );
    const [kept] = await db.withActor(ws, owner, (tx) => listShopProfiles(tx, ws));
    expect(kept).toMatchObject({ name: 'Shop V2 đổi tên', slogan: 'Đẹp mỗi ngày' });
    expect(kept?.branches).toHaveLength(2);

    await db.withActor(ws, owner, (tx) =>
      upsertShopProfile(tx, ws, base(), {
        slogan: null,
        industries: [],
        legalName: null,
        taxId: null,
        hours: null,
        contacts: null,
        branches: [],
      }),
    );
    const [cleared] = await db.withActor(ws, owner, (tx) => listShopProfiles(tx, ws));
    expect(cleared).toMatchObject({
      slogan: null,
      industries: [],
      hours: null,
      contacts: null,
      branches: [],
    });
  });

  it('khác workspace: không thấy; Staff không ghi được (RLS sẵn có)', async () => {
    await db.withActor(ws, owner, (tx) => upsertShopProfile(tx, ws, base(), V2));
    expect(await db.withActor(other, otherOwner, (tx) => listShopProfiles(tx, other))).toEqual([]);
    await expect(
      db.withActor(ws, staff, (tx) => upsertShopProfile(tx, ws, base(), V2)),
    ).rejects.toThrow();
  });

  it('độ sẵn sàng: trường mới trả về cờ có/không, KHÔNG trả giá trị (không rò số điện thoại)', async () => {
    const data = await db.withActor(ws, owner, (tx) => loadReadinessSource(tx, ws));
    const [p] = data.shopProfiles;
    expect(p).toMatchObject({
      hasStructuredHours: true,
      hasContactChannel: true,
      hasBranchAddress: true,
    });
    expect(JSON.stringify(data)).not.toContain('zalo.me');
  });
});
