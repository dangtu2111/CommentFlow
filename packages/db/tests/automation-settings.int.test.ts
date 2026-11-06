import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  type AutomationSettingsInput,
  getAutomationSettings,
  saveAutomationSettings,
} from '../src/queries/automation-settings';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode as rejectCodeOf,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * AUTO-CONFIG-STORE (FR-070/071, Q-ACS1): chỉ Owner ghi (Staff/người ngoài/withWorkspace trần bị RLS chặn), đọc theo
 * workspace (không thấy chéo), kênh của workspace khác bị khóa ngoại chặn, CHECK giữ sàn ngưỡng/trễ/giới hạn,
 * `updated_by` không giả danh được, lưu lại thay thế đúng bộ ô.
 */
const RLS = '42501';
const FK = '23503';
const CHECK = '23514';

let admin: pg.Pool;
let db: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;
let stranger: string;

const expectRejectCode = async (promise: Promise<unknown>, code: string) =>
  expect(await rejectCodeOf(promise)).toBe(code);

async function seedChannel(workspace: string): Promise<string> {
  const r = await admin.query(
    "INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, 'facebook', $2, 'Page') RETURNING id",
    [workspace, `acs-${randomUUID()}`],
  );
  return r.rows[0].id as string;
}

const config = (over: Partial<AutomationSettingsInput> = {}): AutomationSettingsInput => ({
  threshold: 0.9,
  delaySeconds: 120,
  dailyCap: 30,
  activeHours: { days: [1, 2, 3], from: '08:00', to: '21:30' },
  blockedKeywords: ['ship', 'Giảm giá'],
  signature: '— Trợ lý AI',
  rules: [],
  ...over,
});

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'acsOwner');
  staff = await seedUser(admin, 'acsStaff');
  otherOwner = await seedUser(admin, 'acsOtherOwner');
  stranger = await seedUser(admin, 'acsStranger');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-070/071 lưu cấu hình tự gửi', () => {
  it('chưa lưu → null; Owner lưu rồi đọc lại đúng từng trường (kể cả ô ma trận)', async () => {
    expect(await db.withActor(ws, owner, (tx) => getAutomationSettings(tx, ws))).toBeNull();
    const ch = await seedChannel(ws);
    const input = config({
      rules: [
        { channelId: ch, target: 'comment', label: 'price', mode: 'auto' },
        { channelId: ch, target: 'message', label: 'advice', mode: 'shadow' },
      ],
    });
    await db.withActor(ws, owner, (tx) => saveAutomationSettings(tx, ws, owner, input));
    const row = await db.withActor(ws, owner, (tx) => getAutomationSettings(tx, ws));
    expect(row).toMatchObject({
      threshold: 0.9,
      delaySeconds: 120,
      dailyCap: 30,
      activeHours: { days: [1, 2, 3], from: '08:00', to: '21:30' },
      blockedKeywords: ['ship', 'Giảm giá'],
      signature: '— Trợ lý AI',
      updatedBy: owner,
    });
    expect(row?.rules).toEqual(
      expect.arrayContaining([
        { channelId: ch, target: 'comment', label: 'price', mode: 'auto' },
        { channelId: ch, target: 'message', label: 'advice', mode: 'shadow' },
      ]),
    );
    expect(row?.rules).toHaveLength(2);
    expect(Math.abs(Date.now() - (row?.updatedAt.getTime() ?? 0))).toBeLessThan(60_000);
  });

  it('lưu lại thay thế đúng bộ ô; null cho giờ/chữ ký; từ khóa rỗng', async () => {
    const ch = await seedChannel(ws);
    await db.withActor(ws, owner, (tx) =>
      saveAutomationSettings(
        tx,
        ws,
        owner,
        config({ rules: [{ channelId: ch, target: 'comment', label: 'purchase', mode: 'auto' }] }),
      ),
    );
    await db.withActor(ws, owner, (tx) =>
      saveAutomationSettings(
        tx,
        ws,
        owner,
        config({
          activeHours: null,
          signature: null,
          blockedKeywords: [],
          rules: [{ channelId: ch, target: 'message', label: 'price', mode: 'off' }],
        }),
      ),
    );
    const row = await db.withActor(ws, owner, (tx) => getAutomationSettings(tx, ws));
    expect(row).toMatchObject({ activeHours: null, signature: null, blockedKeywords: [] });
    expect(row?.rules).toEqual([{ channelId: ch, target: 'message', label: 'price', mode: 'off' }]);
  });

  it('Staff đọc được nhưng không ghi (42501); người ngoài không đọc được', async () => {
    await db.withActor(ws, owner, (tx) => saveAutomationSettings(tx, ws, owner, config()));
    expect((await db.withActor(ws, staff, (tx) => getAutomationSettings(tx, ws)))?.dailyCap).toBe(
      30,
    );
    await expectRejectCode(
      db.withActor(ws, staff, (tx) =>
        saveAutomationSettings(tx, ws, staff, config({ dailyCap: 999 })),
      ),
      RLS,
    );
    expect((await db.withActor(ws, owner, (tx) => getAutomationSettings(tx, ws)))?.dailyCap).toBe(
      30,
    );
    expect(await db.withActor(ws, stranger, (tx) => getAutomationSettings(tx, ws))).toBeNull();
  });

  it('withWorkspace trần đọc được nhưng không ghi; hệ thống (withJob) ghi với updatedBy null', async () => {
    expect((await db.withWorkspace(ws, (tx) => getAutomationSettings(tx, ws)))?.dailyCap).toBe(30);
    await expectRejectCode(
      db.withWorkspace(ws, (tx) => saveAutomationSettings(tx, ws, null, config({ dailyCap: 5 }))),
      RLS,
    );
    await db.withJob(ws, (tx) => saveAutomationSettings(tx, ws, null, config({ dailyCap: 7 })));
    const row = await db.withWorkspace(ws, (tx) => getAutomationSettings(tx, ws));
    expect(row).toMatchObject({ dailyCap: 7, updatedBy: null });
  });

  it('Owner không giả danh người khác ở updated_by; hệ thống không gán người', async () => {
    await expectRejectCode(
      db.withActor(ws, owner, (tx) => saveAutomationSettings(tx, ws, staff, config())),
      RLS,
    );
    await expectRejectCode(
      db.withActor(ws, owner, (tx) => saveAutomationSettings(tx, ws, null, config())),
      RLS,
    );
    await expectRejectCode(
      db.withJob(ws, (tx) => saveAutomationSettings(tx, ws, owner, config())),
      RLS,
    );
  });

  it('chéo workspace: Owner workspace khác không ghi/đọc của ws; kênh của workspace khác bị FK chặn', async () => {
    expect(await db.withActor(other, otherOwner, (tx) => getAutomationSettings(tx, ws))).toBeNull();
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) =>
        saveAutomationSettings(tx, ws, otherOwner, config({ dailyCap: 1 })),
      ),
      RLS,
    );
    const foreignChannel = await seedChannel(other);
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        saveAutomationSettings(
          tx,
          ws,
          owner,
          config({
            rules: [{ channelId: foreignChannel, target: 'comment', label: 'price', mode: 'auto' }],
          }),
        ),
      ),
      FK,
    );
    // giao dịch lỗi hoàn tác toàn bộ: cấu hình cũ còn nguyên
    expect((await db.withActor(ws, owner, (tx) => getAutomationSettings(tx, ws)))?.dailyCap).toBe(
      7,
    );
  });

  it('CHECK ở DB: ngưỡng < 0,80, trễ lạ, giới hạn 0/1001, nhãn Khiếu nại, mức lạ', async () => {
    const ch = await seedChannel(ws);
    const save = (input: AutomationSettingsInput) =>
      db.withActor(ws, owner, (tx) => saveAutomationSettings(tx, ws, owner, input));
    await expectRejectCode(save(config({ threshold: 0.79 })), CHECK);
    await expectRejectCode(save(config({ threshold: 1.01 })), CHECK);
    await expectRejectCode(save(config({ delaySeconds: 30 })), CHECK);
    await expectRejectCode(save(config({ dailyCap: 0 })), CHECK);
    await expectRejectCode(save(config({ dailyCap: 1001 })), CHECK);
    await expectRejectCode(save(config({ signature: '' })), CHECK);
    await expectRejectCode(save(config({ blockedKeywords: Array(51).fill('x') })), CHECK);
    await expectRejectCode(
      save(
        config({
          rules: [
            { channelId: ch, target: 'comment', label: 'complaint' as 'price', mode: 'auto' },
          ],
        }),
      ),
      CHECK,
    );
    await expectRejectCode(
      save(
        config({
          rules: [{ channelId: ch, target: 'comment', label: 'price', mode: 'always' as 'auto' }],
        }),
      ),
      CHECK,
    );
  });

  it('ô trùng khóa bị chặn (23505); Staff không xóa được ô (RLS lọc im lặng, ô còn nguyên)', async () => {
    const ch = await seedChannel(ws);
    const cell = { channelId: ch, target: 'comment', label: 'price', mode: 'auto' } as const;
    await expectRejectCode(
      db.withActor(ws, owner, (tx) =>
        saveAutomationSettings(tx, ws, owner, config({ rules: [cell, { ...cell, mode: 'off' }] })),
      ),
      '23505',
    );
    await db.withActor(ws, owner, (tx) =>
      saveAutomationSettings(tx, ws, owner, config({ rules: [cell] })),
    );
    await db.withActor(ws, staff, (tx) =>
      tx.execute(sql`DELETE FROM cf.automation_rules WHERE workspace_id = ${ws}::uuid`),
    );
    const row = await db.withActor(ws, staff, (tx) => getAutomationSettings(tx, ws));
    expect(row?.rules).toEqual([cell]);
  });
});
