import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  createSpamRule,
  deleteSpamRule,
  listSpamRules,
  SPAM_RULES_MAX_PER_WORKSPACE,
  type SpamRuleInput,
  SpamRuleLimitError,
  setSpamRuleEnabled,
} from '../src/queries/spam-rules';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode as rejectCodeOf,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * SPAM-RULES-STORE (FR-080, Q-SRS1): chỉ Owner (hoặc hệ thống) ghi, đọc theo workspace, CHECK giữ loại/hành động
 * (không `auto_hide`), `created_by` không giả danh, trần 50 quy tắc/workspace, bật-tắt + xóa chỉ Owner.
 */
const RLS = '42501';
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

const rule = (over: Partial<SpamRuleInput> = {}): SpamRuleInput => ({
  name: 'Zalo',
  type: 'keyword',
  pattern: 'zalo, telegram',
  action: 'mark',
  ...over,
});

const create = (workspace: string, actor: string, input: SpamRuleInput) =>
  db.withActor(workspace, actor, (tx) => createSpamRule(tx, workspace, actor, input));

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'srOwner');
  staff = await seedUser(admin, 'srStaff');
  otherOwner = await seedUser(admin, 'srOtherOwner');
  stranger = await seedUser(admin, 'srStranger');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});

afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-080 lưu quy tắc spam', () => {
  it('Owner tạo rồi đọc lại đúng từng trường; mặc định bật, chưa có shadow_until', async () => {
    const id = await create(ws, owner, rule());
    const rows = await db.withActor(ws, owner, (tx) => listSpamRules(tx, ws));
    expect(rows).toEqual([
      expect.objectContaining({
        id,
        name: 'Zalo',
        type: 'keyword',
        pattern: 'zalo, telegram',
        action: 'mark',
        enabled: true,
        shadowUntil: null,
        createdBy: owner,
      }),
    ]);
  });

  it('loại không cần mẫu (phone/link/emoji_only/tag_only) lưu với mẫu rỗng; action skip hợp lệ', async () => {
    await create(ws, owner, rule({ name: 'SĐT', type: 'phone', pattern: '', action: 'skip' }));
    const rows = await db.withActor(ws, staff, (tx) => listSpamRules(tx, ws));
    expect(rows.map((r) => r.name)).toEqual(['Zalo', 'SĐT']);
    expect(rows[1]).toMatchObject({ pattern: '', action: 'skip' });
  });

  it('Staff đọc được nhưng không ghi (42501); người ngoài không đọc được', async () => {
    await expectRejectCode(create(ws, staff, rule({ name: 'Staff' })), RLS);
    expect(await db.withActor(ws, stranger, (tx) => listSpamRules(tx, ws))).toEqual([]);
  });

  it('withWorkspace trần đọc được, không ghi; hệ thống (withJob) ghi với created_by null', async () => {
    expect((await db.withWorkspace(ws, (tx) => listSpamRules(tx, ws))).length).toBe(2);
    await expectRejectCode(
      db.withWorkspace(ws, (tx) => createSpamRule(tx, ws, null, rule({ name: 'Bare' }))),
      RLS,
    );
    await db.withJob(ws, (tx) => createSpamRule(tx, ws, null, rule({ name: 'Job' })));
    const job = (await db.withWorkspace(ws, (tx) => listSpamRules(tx, ws))).find(
      (r) => r.name === 'Job',
    );
    expect(job?.createdBy).toBeNull();
  });

  it('created_by không giả danh: Owner ≠ người khác/null; hệ thống không gán người', async () => {
    await expectRejectCode(
      db.withActor(ws, owner, (tx) => createSpamRule(tx, ws, staff, rule())),
      RLS,
    );
    await expectRejectCode(
      db.withActor(ws, owner, (tx) => createSpamRule(tx, ws, null, rule())),
      RLS,
    );
    await expectRejectCode(
      db.withJob(ws, (tx) => createSpamRule(tx, ws, owner, rule())),
      RLS,
    );
  });

  it('chéo workspace: không đọc chéo, Owner workspace khác không ghi vào ws', async () => {
    expect(await db.withActor(other, otherOwner, (tx) => listSpamRules(tx, ws))).toEqual([]);
    await expectRejectCode(
      db.withActor(other, otherOwner, (tx) => createSpamRule(tx, ws, otherOwner, rule())),
      RLS,
    );
  });

  it('CHECK ở DB: auto_hide, loại lạ, tên rỗng/dài, mẫu dài, mẫu sai theo loại', async () => {
    const bad = (over: Partial<SpamRuleInput>) => create(ws, owner, rule(over));
    await expectRejectCode(bad({ action: 'auto_hide' as 'mark' }), CHECK);
    await expectRejectCode(bad({ type: 'sql' as 'keyword' }), CHECK);
    await expectRejectCode(bad({ name: '' }), CHECK);
    await expectRejectCode(bad({ name: 'x'.repeat(81) }), CHECK);
    await expectRejectCode(bad({ pattern: 'x'.repeat(201) }), CHECK);
    await expectRejectCode(bad({ type: 'keyword', pattern: '' }), CHECK);
    await expectRejectCode(bad({ type: 'regex', pattern: '' }), CHECK);
    await expectRejectCode(bad({ type: 'link', pattern: 'abc' }), CHECK);
  });

  it('bật/tắt và xóa: Owner được; Staff và workspace khác không đổi gì', async () => {
    const id = await create(ws, owner, rule({ name: 'Toggle' }));
    expect(await db.withActor(ws, owner, (tx) => setSpamRuleEnabled(tx, ws, id, false))).toBe(true);
    const find = async () =>
      (await db.withActor(ws, owner, (tx) => listSpamRules(tx, ws))).find((r) => r.id === id);
    expect((await find())?.enabled).toBe(false);
    // Staff / workspace khác: RLS lọc dòng ghi được → không đổi gì (trả false)
    expect(await db.withActor(ws, staff, (tx) => setSpamRuleEnabled(tx, ws, id, true))).toBe(false);
    expect(await db.withActor(ws, staff, (tx) => deleteSpamRule(tx, ws, id))).toBe(false);
    expect(await db.withActor(other, otherOwner, (tx) => deleteSpamRule(tx, ws, id))).toBe(false);
    expect((await find())?.enabled).toBe(false);
    expect(await db.withActor(ws, owner, (tx) => deleteSpamRule(tx, ws, id))).toBe(true);
    expect(await find()).toBeUndefined();
    expect(await db.withActor(ws, owner, (tx) => deleteSpamRule(tx, ws, id))).toBe(false);
  });

  it('nội dung quy tắc bất biến: cf_app không được UPDATE name/pattern/action/type/workspace_id', async () => {
    const id = await create(ws, owner, rule({ name: 'Bất biến' }));
    for (const col of ['name', 'pattern', 'action', 'type', 'workspace_id']) {
      await expectRejectCode(
        db.withActor(ws, owner, (tx) =>
          tx.execute(
            sql`UPDATE cf.rules SET ${sql.raw(col)} = ${sql.raw(col)} WHERE id = ${id}::uuid`,
          ),
        ),
        RLS,
      );
    }
  });

  it('trần 50 quy tắc/workspace: quy tắc vượt trần bị từ chối bằng SpamRuleLimitError', async () => {
    const ws2 = await seedWorkspace(admin);
    const o2 = await seedUser(admin, 'srCapOwner');
    await seedMember(admin, ws2, o2, 'owner');
    for (let i = 0; i < SPAM_RULES_MAX_PER_WORKSPACE; i++) {
      await create(ws2, o2, rule({ name: `R${i}` }));
    }
    await expect(create(ws2, o2, rule({ name: 'Thừa' }))).rejects.toBeInstanceOf(
      SpamRuleLimitError,
    );
    expect((await db.withActor(ws2, o2, (tx) => listSpamRules(tx, ws2))).length).toBe(
      SPAM_RULES_MAX_PER_WORKSPACE,
    );
  });
});
