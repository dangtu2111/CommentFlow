import { randomUUID } from 'node:crypto';
import { buildPriceSnapshot } from '@flow/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import { getDraftPriceSnapshot, insertDraft, type NewDraft } from '../src/queries/drafts';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode as rejectCodeOf,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * PRICE-SNAPSHOT (FR-111, Q-PS1): `cf.drafts` — hệ thống ghi một lần, `price_snapshot` bất biến, người dùng chỉ đổi
 * cột xử lý và không giả được trạng thái do hệ thống đặt, workspace khác không thấy.
 */
const RLS = '42501';
const CHECK = '23514';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let staff: string;
let otherOwner: string;

const expectRejectCode = async (promise: Promise<unknown>, code: string) =>
  expect(await rejectCodeOf(promise)).toBe(code);

const SNAPSHOT = buildPriceSnapshot([
  {
    productId: 'p1',
    variantId: 'v1',
    priceVnd: 199_000,
    stock: 4,
    updatedFromSourceAt: new Date('2026-11-01T03:00:00Z'),
  },
]);

const draft = (over: Partial<NewDraft> = {}): NewDraft => ({
  targetType: 'comment',
  targetId: randomUUID(),
  text: 'Áo này giá 199.000đ ạ',
  lang: 'vi',
  priceSnapshot: SNAPSHOT,
  ...over,
});

const createDraft = (workspace: string, over: Partial<NewDraft> = {}) =>
  db.withJob(workspace, (tx) => insertDraft(tx, workspace, draft(over)));

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  staff = await seedUser(admin, 'staff');
  otherOwner = await seedUser(admin, 'otherOwner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-111 drafts.price_snapshot', () => {
  it('hệ thống lưu bản nháp kèm ảnh chụp; đọc lại đúng từng trường', async () => {
    const id = await createDraft(ws);
    const column = await db.withJob(ws, (tx) => getDraftPriceSnapshot(tx, ws, id));
    expect(column).toEqual(SNAPSHOT);
  });

  it('câu không có số tiền: ảnh chụp rỗng được lưu (mặc định []); id lạ → null', async () => {
    const id = await createDraft(ws, { priceSnapshot: [] });
    expect(await db.withJob(ws, (tx) => getDraftPriceSnapshot(tx, ws, id))).toEqual([]);
    expect(await db.withJob(ws, (tx) => getDraftPriceSnapshot(tx, ws, randomUUID()))).toBeNull();
  });

  it('ảnh chụp sai dạng bị từ chối TRƯỚC khi vào DB (Zod)', async () => {
    const bad = [{ product_id: 'p', variant_id: null, price_vnd: -1 }] as never;
    await expect(createDraft(ws, { priceSnapshot: bad })).rejects.toThrow();
  });

  it('DB cũng chặn cột không phải mảng (CHECK) khi ghi thẳng', async () => {
    await expectRejectCode(
      db.withJob(ws, (tx) =>
        tx.execute(sql`INSERT INTO cf.drafts (workspace_id, target_type, target_id, text, lang, price_snapshot)
          VALUES (${ws}::uuid, 'comment', ${randomUUID()}::uuid, 'x', 'vi', '{}'::jsonb)`),
      ),
      CHECK,
    );
  });

  it('chủ đề chưa trả lời được lưu thành text[] (kể cả dấu nháy)', async () => {
    const id = await createDraft(ws, { unansweredTopics: ["phí ship 'nhanh'", 'bảo hành'] });
    const r = await admin.query('SELECT unanswered_topics FROM cf.drafts WHERE id = $1', [id]);
    expect(r.rows[0].unanswered_topics).toEqual(["phí ship 'nhanh'", 'bảo hành']);
  });
});

describe('RLS drafts', () => {
  it('workspace khác không đọc được ảnh chụp', async () => {
    const id = await createDraft(ws);
    expect(await db.withJob(other, (tx) => getDraftPriceSnapshot(tx, other, id))).toBeNull();
    expect(
      await db.withActor(other, otherOwner, (tx) => getDraftPriceSnapshot(tx, other, id)),
    ).toBeNull();
  });

  it('Staff (thành viên) đọc được; người ngoài workspace không', async () => {
    const id = await createDraft(ws);
    expect(await db.withActor(ws, staff, (tx) => getDraftPriceSnapshot(tx, ws, id))).toEqual(
      SNAPSHOT,
    );
    expect(
      await db.withActor(ws, otherOwner, (tx) => getDraftPriceSnapshot(tx, ws, id)),
    ).toBeNull();
  });

  it('INSERT: Staff và withWorkspace trần bị chặn (chỉ hệ thống tạo bản nháp AI)', async () => {
    await expectRejectCode(
      db.withActor(ws, staff, (tx) => insertDraft(tx, ws, draft())),
      RLS,
    );
    await expectRejectCode(
      db.withWorkspace(ws, (tx) => insertDraft(tx, ws, draft())),
      RLS,
    );
  });

  it('INSERT sang workspace khác bị chặn kể cả là hệ thống', async () => {
    await expectRejectCode(
      db.withJob(ws, (tx) => insertDraft(tx, other, draft())),
      RLS,
    );
  });

  it('Staff đổi được cột xử lý (status=edited, final_text) nhưng KHÔNG sửa price_snapshot/text', async () => {
    const id = await createDraft(ws);
    await db.withActor(ws, staff, (tx) =>
      tx.execute(sql`UPDATE cf.drafts SET status = 'edited', final_text = 'Giá 199k', edit_distance = 3,
        updated_at = now() WHERE id = ${id}::uuid`),
    );
    const r = await admin.query('SELECT status, final_text FROM cf.drafts WHERE id = $1', [id]);
    expect(r.rows[0]).toEqual({ status: 'edited', final_text: 'Giá 199k' });

    await expectRejectCode(
      db.withActor(ws, staff, (tx) =>
        tx.execute(sql`UPDATE cf.drafts SET price_snapshot = '[]'::jsonb WHERE id = ${id}::uuid`),
      ),
      RLS,
    );
    await expectRejectCode(
      db.withJob(ws, (tx) =>
        tx.execute(sql`UPDATE cf.drafts SET price_snapshot = '[]'::jsonb WHERE id = ${id}::uuid`),
      ),
      RLS,
    );
    await expectRejectCode(
      db.withActor(ws, staff, (tx) =>
        tx.execute(sql`UPDATE cf.drafts SET text = 'giá 1đ' WHERE id = ${id}::uuid`),
      ),
      RLS,
    );
  });

  it('Staff không đặt được auto_sent / would_send và không sửa được dòng hệ thống đã đặt', async () => {
    const id = await createDraft(ws);
    await expectRejectCode(
      db.withActor(ws, staff, (tx) =>
        tx.execute(sql`UPDATE cf.drafts SET status = 'auto_sent' WHERE id = ${id}::uuid`),
      ),
      RLS,
    );
    await db.withJob(ws, (tx) =>
      tx.execute(
        sql`UPDATE cf.drafts SET status = 'auto_sent', failed_gate = NULL WHERE id = ${id}::uuid`,
      ),
    );
    // dòng đã auto_sent: Staff không còn thấy dòng để sửa (USING) → 0 dòng đổi
    await db.withActor(ws, staff, (tx) =>
      tx.execute(sql`UPDATE cf.drafts SET status = 'discarded' WHERE id = ${id}::uuid`),
    );
    const r = await admin.query('SELECT status FROM cf.drafts WHERE id = $1', [id]);
    expect(r.rows[0].status).toBe('auto_sent');
  });

  it('CHECK: trạng thái/hành động/ngôn ngữ lạ bị chặn', async () => {
    const id = await createDraft(ws);
    await expectRejectCode(
      db.withJob(ws, (tx) =>
        tx.execute(sql`UPDATE cf.drafts SET status = 'sent' WHERE id = ${id}::uuid`),
      ),
      CHECK,
    );
    await expectRejectCode(
      db.withJob(ws, (tx) => insertDraft(tx, ws, draft({ lang: 'fr' as never }))),
      CHECK,
    );
  });
});
