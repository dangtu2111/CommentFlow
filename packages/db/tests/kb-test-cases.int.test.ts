import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  addKbTestCases,
  deleteKbTestCase,
  listKbTestCases,
  recordKbTestRun,
} from '../src/kb-test-cases';
import {
  createAdminPool,
  createAppDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/** KB-TESTSET-PERSIST (migration 0096): chỉ Owner thêm/xóa/ghi kết quả/đọc bộ câu kiểm thử; workspace khác không thấy; giới hạn 20 câu/lần và 100 câu/workspace. */
const RLS = '42501';
const INVALID = '22023';
const TOO_MANY = '53400';
const CHECK = '23514';

let admin: pg.Pool;
let app: FlowDb;
let ws: string;
let other: string;
let owner: string;
let staff: string;
let otherOwner: string;

const asOwner = <T>(fn: (tx: Parameters<Parameters<FlowDb['withActor']>[2]>[0]) => Promise<T>) =>
  app.withActor(ws, owner, fn);
const sample = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    question: `câu ${i}`,
    expectAction: 'answer' as const,
    replyIncludes: i === 0 ? ['giá'] : [],
  }));

beforeAll(async () => {
  admin = createAdminPool();
  app = createAppDb(3);
  ws = await seedWorkspace(admin);
  other = await seedWorkspace(admin);
  owner = await seedUser(admin, 'kbt-owner');
  staff = await seedUser(admin, 'kbt-staff');
  otherOwner = await seedUser(admin, 'kbt-other');
  await seedMember(admin, ws, owner, 'owner');
  await seedMember(admin, ws, staff, 'staff');
  await seedMember(admin, other, otherOwner, 'owner');
});
afterAll(async () => {
  await app.close();
  await admin.end();
});

describe('bộ câu kiểm thử đã lưu', () => {
  it('Owner thêm, đọc lại đúng thứ tự và từ khóa; ghi kết quả lần chạy cuối; xóa một câu', async () => {
    expect(await asOwner((tx) => addKbTestCases(tx, sample(3)))).toBe(3);
    const rows = await asOwner((tx) => listKbTestCases(tx, ws));
    expect(rows.map((r) => r.question)).toEqual(['câu 0', 'câu 1', 'câu 2']);
    expect(rows[0]).toMatchObject({
      expectAction: 'answer',
      replyIncludes: ['giá'],
      lastStatus: null,
    });
    const first = rows[0]?.id as string;
    await asOwner((tx) =>
      recordKbTestRun(tx, [
        {
          id: first,
          status: 'fail',
          actual: 'redirect',
          reply: 'ib shop',
          failures: ['action_mismatch'],
        },
      ]),
    );
    const after = await asOwner((tx) => listKbTestCases(tx, ws));
    expect(after[0]).toMatchObject({
      lastStatus: 'fail',
      lastActual: 'redirect',
      lastReply: 'ib shop',
      lastFailures: ['action_mismatch'],
    });
    expect(after[0]?.lastRunAt).toBeInstanceOf(Date);
    await asOwner((tx) => deleteKbTestCase(tx, first));
    expect((await asOwner((tx) => listKbTestCases(tx, ws))).map((r) => r.id)).not.toContain(first);
  });

  it('Staff không thấy và không ghi được; Owner workspace khác không thấy/không xóa/không ghi đè kết quả', async () => {
    const mine = (await asOwner((tx) => listKbTestCases(tx, ws)))[0]?.id as string;
    expect(await app.withActor(ws, staff, (tx) => listKbTestCases(tx, ws))).toEqual([]);
    expect(
      await expectRejectCode(app.withActor(ws, staff, (tx) => addKbTestCases(tx, sample(1)))),
    ).toBe(RLS);
    expect(
      await expectRejectCode(app.withActor(ws, staff, (tx) => deleteKbTestCase(tx, mine))),
    ).toBe(RLS);
    expect(await app.withActor(other, otherOwner, (tx) => listKbTestCases(tx, other))).toEqual([]);
    await app.withActor(other, otherOwner, (tx) => deleteKbTestCase(tx, mine));
    await app.withActor(other, otherOwner, (tx) =>
      recordKbTestRun(tx, [{ id: mine, status: 'pass', failures: [] }]),
    );
    const row = (await asOwner((tx) => listKbTestCases(tx, ws))).find((r) => r.id === mine);
    expect(row).toBeDefined();
    expect(row?.lastStatus).not.toBe('pass');
  });

  it('mảng rỗng / quá 20 câu → 22023; hành động hoặc câu hỏi sai → 23514', async () => {
    expect(await expectRejectCode(asOwner((tx) => addKbTestCases(tx, [])))).toBe(INVALID);
    expect(await expectRejectCode(asOwner((tx) => addKbTestCases(tx, sample(21))))).toBe(INVALID);
    expect(
      await expectRejectCode(
        asOwner((tx) =>
          addKbTestCases(tx, [{ question: 'x', expectAction: 'bad' as never, replyIncludes: [] }]),
        ),
      ),
    ).toBe(CHECK);
    expect(
      await expectRejectCode(
        asOwner((tx) =>
          addKbTestCases(tx, [{ question: ' ', expectAction: 'answer', replyIncludes: [] }]),
        ),
      ),
    ).toBe(CHECK);
  });

  it('tối đa 100 câu mỗi workspace → 53400', async () => {
    const current = (await asOwner((tx) => listKbTestCases(tx, ws))).length;
    let have = current;
    while (have + 20 <= 100) {
      await asOwner((tx) => addKbTestCases(tx, sample(20)));
      have += 20;
    }
    if (have < 100) await asOwner((tx) => addKbTestCases(tx, sample(100 - have)));
    expect(await expectRejectCode(asOwner((tx) => addKbTestCases(tx, sample(1))))).toBe(TOO_MANY);
  });
});
